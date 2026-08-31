import request from './request'

const { VITE_CLIENT_ID } = import.meta.env

/**
 * 项目 B 登录接口
 * @param {Object} params - 登录参数
 * @param {string} params.username - 用户名
 * @param {string} params.password - 密码
 * @returns {Promise} 登录结果，包含 access_token
 */
export function apiLogin(params) {
  return request({
    url: '/oauth/login',
    method: 'POST',
    needAuth: false,
    params
  })
}

/**
 * 项目 B 获取当前登录用户信息
 * @returns {Promise} 用户信息
 */
export function apiProfile() {
  return request({
    url: '/oauth/public/getUserInfo',
    method: 'get',
    params: {
      client_id: VITE_CLIENT_ID
    }
  })
}

/**
 * 项目 B 退出登录
 * @returns {Promise}
 */
export function loginOutApi() {
  return request({
    url: '/oauth/public/logout',
    method: 'post'
  })
}
