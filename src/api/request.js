import axios from 'axios'
import { getStorage, removeStorage } from '@/utils/storage'

// 项目 B 网关地址
const BASE_URL = import.meta.env.VITE_HTTP_BASE_URL
// 请求超时时间
const TIMEOUT = Number(import.meta.env.VITE_HTTP_TIMEOUT) || 300000

// 创建 axios 实例，携带 cookie 以兼容项目 B 的 SSO 场景
const request = axios.create({
  baseURL: BASE_URL,
  timeout: TIMEOUT,
  withCredentials: true
})

// 请求拦截器：注入 token 与语言头
request.interceptors.request.use(
  async (config) => {
    // 设置语言头
    config.headers['x-lang'] = 'en_US'
    // 未登录接口跳过鉴权
    if (config.needAuth === false) return config
    // 从 chrome.storage 获取项目 B 的 access_token
    const token = await getStorage('token')
    if (token) {
      config.headers.Authorization = `bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// 响应拦截器：统一处理项目 B 网关响应码
request.interceptors.response.use(
  async (response) => {
    const { code, data, message: msg, msg: gatewayMsg } = response.data || {}
    const messageText = msg || gatewayMsg
    // 项目 B 网关成功码为 1000，旧接口成功码为 "0"
    if (code === 1000 || code === '0') {
      return { code: 0, data, message: messageText }
    }
    return { code, data, message: messageText }
  },
  async (error) => {
    // 401 表示登录已过期，清除本地登录态
    // // popup/batch 扩展页可安全 reload；background 无 window 对象需跳过
    // if (error.response && error.response.status === 401) {
    //   await removeStorage('token')
    //   await removeStorage('user')
    //   if (typeof window !== 'undefined' && window.location) {
    //     window.location.reload()
    //   }
    // }
    return Promise.reject(error)
  }
)

export default request
