/**
 * 视频下载工具
 * 通过 background 中转调用 chrome.downloads API
 */

/**
 * 根据 URL 推断下载文件名
 * @param {string} url - 视频地址
 * @returns {string}
 */
export function guessVideoFilename(url) {
  if (!url || url.startsWith('placeholder://')) return `video_${Date.now()}.mp4`
  try {
    const pathname = new URL(url).pathname
    const name = pathname.split('/').pop()
    if (name && name.includes('.')) return decodeURIComponent(name)
  } catch {
    // URL 解析失败时使用默认文件名
  }
  if (/\.m3u8?(\?|$)/i.test(url)) return `stream_${Date.now()}.m3u8`
  return `video_${Date.now()}.mp4`
}

/**
 * 判断视频是否可下载
 * @param {Object} video - 视频扫描结果对象
 * @returns {boolean}
 */
export function isVideoDownloadable(video) {
  if (!video?.url) return false
  if (video.isEmbed) return false
  if (video.needsInteraction && video.url.startsWith('placeholder://')) return false
  return true
}

/**
 * 判断视频是否可在扩展页直接预览播放
 * @param {Object} video - 视频扫描结果对象
 * @returns {boolean}
 */
export function isVideoPlayable(video) {
  if (!video?.url) return false
  if (video.isEmbed) return false
  if (video.needsInteraction && video.url.startsWith('placeholder://')) return false
  return true
}

/**
 * 根据 URL 推断通用下载文件名
 * @param {string} url - 资源地址
 * @param {string} fallbackExt - 默认扩展名
 * @returns {string}
 */
function guessFilename(url, fallbackExt = 'bin') {
  try {
    const pathname = new URL(url).pathname
    const name = pathname.split('/').pop()
    if (name && name.includes('.')) return decodeURIComponent(name)
  } catch {
    // URL 解析失败时使用默认文件名
  }
  return `file_${Date.now()}.${fallbackExt}`
}

/**
 * 发起通用文件下载请求
 * @param {Object} params
 * @param {string} params.url - 文件地址
 * @param {number} [params.tabId] - 来源 tabId（blob 下载必需）
 * @param {string} [params.filename] - 自定义文件名
 * @returns {Promise<{success: boolean, downloadId?: number, error?: string}>}
 */
export function downloadFile({ url, tabId, filename }) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({
      type: 'DOWNLOAD_FILE',
      url,
      tabId,
      filename: filename || guessFilename(url)
    }, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ success: false, error: chrome.runtime.lastError.message })
        return
      }
      resolve(response || { success: false, error: '下载无响应' })
    })
  })
}

/**
 * 发起视频下载请求
 * @param {Object} params
 * @param {string} params.url - 视频地址
 * @param {number} [params.tabId] - 来源 tabId（blob 下载必需）
 * @param {string} [params.filename] - 自定义文件名
 * @returns {Promise<{success: boolean, downloadId?: number, error?: string}>}
 */
export function downloadVideo({ url, tabId, filename }) {
  return downloadFile({ url, tabId, filename: filename || guessVideoFilename(url) })
}
