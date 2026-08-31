import JSZip from 'jszip'

// 图片合法后缀
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg', 'ico', 'tiff'])
// 视频合法后缀
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'avi', 'mkv', 'flv', 'm3u8', 'ts'])

/**
 * 判断文件名是否包含图片后缀
 * @param {string} name - 文件名
 * @returns {boolean}
 */
function hasImageExtension(name) {
  const ext = name.split('.').pop()?.toLowerCase()
  return IMAGE_EXTENSIONS.has(ext)
}

/**
 * 判断文件名是否包含视频后缀
 * @param {string} name - 文件名
 * @returns {boolean}
 */
function hasVideoExtension(name) {
  const ext = name.split('.').pop()?.toLowerCase()
  return VIDEO_EXTENSIONS.has(ext)
}

/**
 * 从媒体对象中提取文件名，缺少后缀时按类型补齐
 * @param {Object} item - 媒体对象
 * @param {string} item.url - 资源地址
 * @param {string} item.type - 媒体类型 'image' | 'video'
 * @param {string} fallbackName - 兜底文件名
 * @returns {string}
 */
function extractFilename(item, fallbackName) {
  const { url, type } = item || {}
  if (!url || url.startsWith('placeholder://')) return fallbackName

  try {
    const pathname = new URL(url).pathname
    let name = pathname.split('/').pop()
    if (!name) return fallbackName
    name = decodeURIComponent(name)

    // 图片无后缀时补 .webp，视频无后缀时补 .mp4
    if (type === 'image' && !hasImageExtension(name)) {
      return `${name}.webp`
    }
    if (type === 'video' && !hasVideoExtension(name)) {
      return `${name}.mp4`
    }
    return name
  } catch {
    // URL 解析失败时使用兜底文件名
  }
  return fallbackName
}

/**
 * 获取唯一文件名，避免 ZIP 内重复覆盖
 * @param {string} filename - 原始文件名
 * @param {Set<string>} usedNames - 已使用的文件名集合
 * @returns {string}
 */
function getUniqueFilename(filename, usedNames) {
  if (!usedNames.has(filename)) return filename
  const lastDot = filename.lastIndexOf('.')
  const base = lastDot > 0 ? filename.slice(0, lastDot) : filename
  const ext = lastDot > 0 ? filename.slice(lastDot) : ''
  let index = 1
  let candidate = `${base}_${index}${ext}`
  while (usedNames.has(candidate)) {
    index++
    candidate = `${base}_${index}${ext}`
  }
  return candidate
}

/**
 * 通过 content script 读取 blob URL 内容
 * @param {string} url - blob URL
 * @param {number} tabId - 来源标签页 ID
 * @returns {Promise<Blob>}
 */
async function fetchBlobFromContentScript(url, tabId) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: 'FETCH_BLOB_AS_DATA_URL', url, tabId },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message))
          return
        }
        if (!response?.success) {
          reject(new Error(response?.error || 'blob 读取失败'))
          return
        }
        fetch(response.dataUrl)
          .then((res) => res.blob())
          .then(resolve)
          .catch(reject)
      }
    )
  })
}

/**
 * 获取媒体资源的 Blob
 * @param {Object} item - 媒体对象
 * @param {string} item.url - 媒体地址
 * @param {number} [tabId] - 来源标签页 ID（blob 下载必需）
 * @returns {Promise<Blob>}
 */
async function fetchMediaBlob(item, tabId) {
  if (item.url.startsWith('blob:')) {
    if (!tabId) throw new Error('blob 资源缺少来源标签页')
    return fetchBlobFromContentScript(item.url, tabId)
  }
  const res = await fetch(item.url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.blob()
}

/**
 * 将媒体列表打包为 ZIP 并触发下载
 * @param {Object} params
 * @param {Array} params.items - 媒体对象列表
 * @param {'images'|'videos'} params.type - 媒体类型
 * @param {number} [params.tabId] - 来源标签页 ID
 * @param {Function} [params.onProgress] - 单个媒体进度回调 (index, status, error)
 * @returns {Promise<{success: boolean, count: number, error?: string}>}
 */
export async function downloadMediaAsZip({ items, type, tabId, onProgress }) {
  if (!items || items.length === 0) {
    return { success: false, count: 0, error: '没有可下载的媒体' }
  }

  const zip = new JSZip()
  const usedNames = new Set()
  const fallbackExt = type === 'images' ? 'webp' : 'mp4'
  let successCount = 0

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    try {
      onProgress?.(i, 'downloading', '')
      const blob = await fetchMediaBlob(item, tabId)
      const fallbackName = `${type === 'images' ? 'image' : 'video'}_${i}.${fallbackExt}`
      const originalName = extractFilename(item, fallbackName)
      const filename = getUniqueFilename(originalName, usedNames)
      usedNames.add(filename)
      zip.file(filename, blob)
      successCount++
      onProgress?.(i, 'success', '')
    } catch (err) {
      console.error(`[ZIP 打包] 下载失败: ${item.url}`, err)
      onProgress?.(i, 'failed', err.message || '下载失败')
    }
  }

  if (successCount === 0) {
    return { success: false, count: 0, error: '所有媒体下载失败，无法生成压缩包' }
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' })
  const zipUrl = URL.createObjectURL(zipBlob)
  const zipFilename = `${type === 'images' ? 'images' : 'videos'}_${Date.now()}.zip`

  return new Promise((resolve) => {
    chrome.downloads.download({ url: zipUrl, filename: zipFilename }, (downloadId) => {
      if (chrome.runtime.lastError) {
        URL.revokeObjectURL(zipUrl)
        resolve({ success: false, count: successCount, error: chrome.runtime.lastError.message })
        return
      }
      // 稍等释放 blob URL，给下载留足时间
      setTimeout(() => URL.revokeObjectURL(zipUrl), 60000)
      resolve({ success: true, count: successCount, downloadId })
    })
  })
}
