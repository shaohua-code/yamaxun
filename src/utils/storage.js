/**
 * chrome.storage 封装工具
 * 提供对 chrome.storage.local 的 Promise 化读写操作
 */

/**
 * 从 chrome.storage 获取数据
 * @param {string} key - 存储键名
 * @returns {Promise<any>} 存储的值
 */
export function getStorage(key) {
  return new Promise((resolve) => {
    chrome.storage.local.get(key, (result) => {
      resolve(result[key])
    })
  })
}

/**
 * 向 chrome.storage 写入数据
 * @param {string} key - 存储键名
 * @param {any} value - 存储的值
 * @returns {Promise<void>}
 */
export function setStorage(key, value) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: value }, () => {
      resolve()
    })
  })
}

/**
 * 从 chrome.storage 删除数据
 * @param {string} key - 存储键名
 * @returns {Promise<void>}
 */
export function removeStorage(key) {
  return new Promise((resolve) => {
    chrome.storage.local.remove(key, () => {
      resolve()
    })
  })
}
