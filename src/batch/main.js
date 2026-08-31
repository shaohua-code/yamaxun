import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import '@/style.css'

// 创建批量上传窗口应用实例
const app = createApp(App)
app.use(createPinia())
app.mount('#app')
