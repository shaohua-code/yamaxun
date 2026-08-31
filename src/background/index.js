/**
 * Chrome 插件后台脚本（Service Worker）
 * 职责：消息中转、商品采集、媒体下载和工作台窗口管理
 */

const WORKSPACE_URL = 'src/workspace/index.html'

/**
 * 创建右键菜单
 * 放在顶层确保 Service Worker 启动时立即创建
 * 使用 removeAll + create 避免重复创建报错
 * contexts 用 all，使页面任意位置右键都能出现菜单
 */
function createContextMenu() {
  chrome.contextMenus.removeAll(() => {
    // chrome.contextMenus.create({
    //   id: 'saveImageToLibrary',
    //   title: '保存图片到素材库',
    //   contexts: ['all']
    // }, () => {
    //   if (chrome.runtime.lastError) {
    //     console.error('创建右键菜单失败:', chrome.runtime.lastError.message)
    //   } else {
    //     console.log('右键菜单创建成功')
    //   }
    // })
  })
}

function openExtensionWindow(url, width, height) {
  chrome.windows.create({ url: chrome.runtime.getURL(url), type: 'popup', width, height })
}

chrome.runtime.onInstalled.addListener(() => {})

/**
 * 判断 URL 是否允许注入 content script
 * @param {string} url
 * @returns {boolean}
 */
function isInjectableUrl(url) {
  if (!url) return false
  return url.startsWith('http://') || url.startsWith('https://')
}

/**
 * 获取 tab 信息
 * @param {number} tabId
 * @returns {Promise<chrome.tabs.Tab|null>}
 */
function getTabInfo(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) resolve(null)
      else resolve(tab)
    })
  })
}

/**
 * 从 manifest 读取 content script 文件路径（兼容 dev / build）
 * @returns {string[]}
 */
function getContentScriptFiles() {
  return chrome.runtime.getManifest().content_scripts?.[0]?.js ?? []
}

/**
 * 编程式注入 content script（页面未刷新导致脚本缺失时使用）
 * @param {number} tabId
 */
async function injectContentScript(tabId) {
  const files = getContentScriptFiles()
  if (!files.length) {
    throw new Error('未找到 content script 配置')
  }
  await chrome.scripting.executeScript({
    target: { tabId },
    files
  })
}

/**
 * 单次向 tab 发送消息
 * @param {number} tabId
 * @param {Object} message
 * @returns {Promise<{ok: boolean, response?: Object, error?: string}>}
 */
function sendMessageToTabOnce(tabId, message) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message })
        return
      }
      resolve({ ok: true, response })
    })
  })
}

/**
 * 将 Chrome 原生错误转为用户可读提示
 * @param {string} url
 * @returns {string}
 */
function formatConnectionError(url) {
  if (!isInjectableUrl(url)) {
    return '当前页面不支持扫描，请切换到普通 http/https 网页'
  }
  return '页面脚本未就绪，请刷新目标网页后重试'
}

/**
 * 向 tab 发送消息，失败时自动注入 content script 并重试
 * @param {number} tabId
 * @param {Object} message
 * @returns {Promise<Object>}
 */
async function sendMessageToTab(tabId, message) {
  if (!tabId) {
    return { success: false, error: '未找到目标标签页' }
  }

  const tab = await getTabInfo(tabId)
  if (!tab) {
    return { success: false, error: '目标标签页不存在或已关闭' }
  }
  if (!isInjectableUrl(tab.url)) {
    return { success: false, error: formatConnectionError(tab.url) }
  }

  // 首次尝试直接通信
  let result = await sendMessageToTabOnce(tabId, message)
  if (result.ok) {
    return result.response || { success: false, error: 'content script 无响应' }
  }

  const errMsg = result.error || ''
  // 仅「接收端不存在」时尝试自动注入
  if (!errMsg.includes('Receiving end does not exist')) {
    return { success: false, error: errMsg }
  }

  try {
    await injectContentScript(tabId)
    // 注入后等待脚本初始化
    await new Promise((resolve) => setTimeout(resolve, 150))
    result = await sendMessageToTabOnce(tabId, message)
    if (result.ok) {
      return result.response || { success: false, error: 'content script 无响应' }
    }
    return { success: false, error: formatConnectionError(tab.url) }
  } catch (injectErr) {
    return { success: false, error: injectErr.message || formatConnectionError(tab.url) }
  }
}

/**
 * 解析扫描目标 tabId
 * 优先使用消息传入的 tabId（batch 窗口重扫场景），否则取当前窗口 active tab
 * @param {number|undefined} tabId - 指定标签页 ID
 * @returns {Promise<number|null>}
 */
function resolveTargetTabId(tabId) {
  return new Promise((resolve) => {
    if (tabId) {
      resolve(tabId)
      return
    }
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(tabs[0]?.id ?? null)
    })
  })
}

/**
 * 向指定 tab 的 content script 发送扫描消息（含自动注入重试）
 * @param {number} tabId - 目标标签页 ID
 * @param {string} scanType - SCAN_MEDIA 或 SCAN_IMAGES
 * @returns {Promise<Object>}
 */
async function sendScanMessage(tabId, scanType) {
  return sendMessageToTab(tabId, { type: scanType })
}

/**
 * 根据 URL 推断下载文件名
 * @param {string} url - 资源地址
 * @param {string} fallbackExt - 默认扩展名
 * @returns {string}
 */
function guessFilename(url, fallbackExt = 'mp4') {
  try {
    const pathname = new URL(url).pathname
    const name = pathname.split('/').pop()
    if (name && name.includes('.')) return name
  } catch {
    // URL 解析失败时使用默认文件名
  }
  return `video_${Date.now()}.${fallbackExt}`
}

/**
 * 监听来自 popup/batch 的消息
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 扫描当前页面图片（兼容旧接口）
  if (message.type === 'SCAN_PAGE_IMAGES') {
    resolveTargetTabId(message.tabId).then(async (tabId) => {
      const response = await sendScanMessage(tabId, 'SCAN_IMAGES')
      sendResponse(response)
    })
    return true
  }

  // 采集当前页面商品字段，统一由后台转发到来源标签页
  if (message.type === 'CAPTURE_PRODUCT') {
    resolveTargetTabId(message.tabId).then(async (tabId) => {
      const response = await sendMessageToTab(tabId, { type: 'CAPTURE_PRODUCT' })
      sendResponse(response)
    })
    return true
  }

  // 扫描当前页面媒体资源（图片和视频分离返回）
  if (message.type === 'SCAN_PAGE_MEDIA') {
    resolveTargetTabId(message.tabId).then(async (tabId) => {
      const response = await sendScanMessage(tabId, 'SCAN_MEDIA')
      sendResponse(response)
    })
    return true
  }

  // 打开批量上传窗口
  if (message.type === 'OPEN_BATCH_WINDOW') {
    openExtensionWindow('src/batch/index.html', 980, 760)
    sendResponse({ success: true })
  }

  if (message.type === 'OPEN_WORKSPACE') {
    openExtensionWindow(WORKSPACE_URL, 1380, 900)
    sendResponse({ success: true })
  }

  // 获取当前标签页信息（支持指定 tabId）
  if (message.type === 'GET_CURRENT_TAB') {
    resolveTargetTabId(message.tabId).then((tabId) => {
      if (!tabId) {
        sendResponse({ success: false, error: '未找到当前标签页' })
        return
      }
      chrome.tabs.get(tabId, (tab) => {
        if (chrome.runtime.lastError) {
          sendResponse({ success: false, error: chrome.runtime.lastError.message })
          return
        }
        if (!isInjectableUrl(tab.url)) {
          sendResponse({ success: false, error: formatConnectionError(tab.url) })
          return
        }
        sendResponse({ tabId: tab.id, url: tab.url, title: tab.title })
      })
    })
    return true
  }

  /**
   * 处理文件下载：直链走 chrome.downloads，blob 走 content script 中转
   * @param {string} url - 文件地址
   * @param {number} [tabId] - 来源 tabId
   * @param {string} [filename] - 自定义文件名
   * @returns {Promise<{success: boolean, downloadId?: number, error?: string}>}
   */
  async function handleDownloadFile(url, tabId, filename) {
    if (!url) {
      return { success: false, error: '缺少文件地址' }
    }

    // blob URL 需在源页面 content script 中读取后转 data URL
    if (url.startsWith('blob:')) {
      const targetTabId = await resolveTargetTabId(tabId)
      if (!targetTabId) {
        return { success: false, error: '未找到来源标签页，无法下载 blob 文件' }
      }
      const response = await sendMessageToTab(targetTabId, { type: 'FETCH_BLOB_AS_DATA_URL', url })
      if (!response?.success) {
        return { success: false, error: response?.error || 'blob 读取失败' }
      }
      try {
        const downloadId = await chrome.downloads.download({
          url: response.dataUrl,
          filename: filename || `file_${Date.now()}`,
          saveAs: false
        })
        return { success: true, downloadId }
      } catch (err) {
        return { success: false, error: err.message }
      }
    }

    // 直链文件直接下载
    return new Promise((resolve) => {
      chrome.downloads.download({
        url,
        filename: filename || guessFilename(url),
        saveAs: false
      }, (downloadId) => {
        if (chrome.runtime.lastError) {
          resolve({ success: false, error: chrome.runtime.lastError.message })
          return
        }
        resolve({ success: true, downloadId })
      })
    })
  }

  // 通用文件下载
  if (message.type === 'DOWNLOAD_FILE') {
    const { url, tabId, filename } = message
    handleDownloadFile(url, tabId, filename).then(sendResponse)
    return true
  }

  // 下载视频：复用通用文件下载（兼容旧接口）
  if (message.type === 'DOWNLOAD_VIDEO') {
    const { url, tabId, filename } = message
    handleDownloadFile(url, tabId, filename || guessFilename(url)).then(sendResponse)
    return true
  }
})
