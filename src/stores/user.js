import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { apiLogin, apiProfile, loginOutApi } from '@/api/auth'
import { encrypt } from '@/utils/encrypt'
import { getStorage, setStorage, removeStorage } from '@/utils/storage'

// 用户状态管理（对接项目 B 的 oauth 登录体系）
export const useUserStore = defineStore('user', () => {
  // token
  const token = ref(null)
  // 用户信息
  const userInfo = ref(null)

  // 是否已登录（临时跳过登录校验，恢复时改回: !!token.value）
  const isLoggedIn = computed(() => true)

  /**
   * 从 chrome.storage 恢复登录态
   */
  async function restoreLogin() {
    const savedToken = await getStorage('token')
    const savedUser = await getStorage('user')
    if (savedToken && savedUser) {
      token.value = savedToken
      userInfo.value = savedUser
    }
  }

  /**
   * 登录（项目 B oauth/login）
   * @param {string} username - 用户名
   * @param {string} password - 密码
   */
  async function login(username, password) {
    // 密码使用项目 B 的公钥加密后再传输
    const res = await apiLogin({ username, password: encrypt(password) })
    if (res.code === 0 && res.data?.access_token) {
      token.value = res.data.access_token
      await setStorage('token', res.data.access_token)
      // 登录成功后拉取用户信息（含 tenantId，上传接口需要）
      const profileRes = await apiProfile()
      if (profileRes.code === 0) {
        userInfo.value = profileRes.data
        await setStorage('user', profileRes.data)
      }
    }
    return res
  }

  /**
   * 清除本地登录态
   */
  async function clearLoginStatus() {
    token.value = null
    userInfo.value = null
    await removeStorage('token')
    await removeStorage('user')
  }

  /**
   * 退出登录：先调接口，再清状态，最后刷新页面
   */
  async function logout() {
    try {
      await loginOutApi()
    } catch (err) {
      console.error('退出登录接口调用失败:', err)
    }
    await clearLoginStatus()
    setTimeout(() => window.location.reload(), 0)
  }

  return {
    token,
    userInfo,
    isLoggedIn,
    restoreLogin,
    login,
    clearLoginStatus,
    logout
  }
})
