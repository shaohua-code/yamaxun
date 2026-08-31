<script setup>
import { reactive, ref } from 'vue'
import { useUserStore } from '@/stores/user'

const userStore = useUserStore()

// 登录表单数据
const form = reactive({ username: '', password: '' })
// 错误提示
const errorMsg = ref('')
// 登录加载状态
const loading = ref(false)

/**
 * 提交登录
 * 校验表单 -> 调用 store 登录 -> 根据结果设置错误提示
 */
async function handleSubmit() {
  if (!form.username || !form.password) {
    errorMsg.value = '用户名和密码不能为空'
    return
  }
  loading.value = true
  errorMsg.value = ''
  try {
    const res = await userStore.login(form.username, form.password)
    if (res.code !== 0) {
      errorMsg.value = res.message || '登录失败'
    }
  } catch (err) {
    errorMsg.value = '网络错误，请检查网关服务'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="flex flex-col items-center  px-6 py-8  w-[360px] min-h-[300px] bg-white">
    <h2 class="mb-6 text-xl font-bold text-gray-800">登录</h2>
    <div class="flex flex-col w-full gap-3">
      <input
        v-model="form.username"
        type="text"
        placeholder="用户名"
        class="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-blue-500"
      />
      <input
        v-model="form.password"
        type="password"
        placeholder="密码"
        class="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-blue-500"
        @keyup.enter="handleSubmit"
      />
      <p v-if="errorMsg" class="text-xs text-red-500">{{ errorMsg }}</p>
      <button
        :disabled="loading"
        class="w-full py-2 text-sm text-white bg-blue-500 rounded-md hover:bg-blue-600 disabled:opacity-50"
        @click="handleSubmit"
      >
        {{ loading ? '登录中...' : '登录' }}
      </button>
    </div>
  </div>
</template>
