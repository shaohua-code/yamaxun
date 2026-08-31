import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { crx } from '@crxjs/vite-plugin'
import Components from 'unplugin-vue-components/vite'
import { AntDesignVueResolver } from 'unplugin-vue-components/resolvers'
import { fileURLToPath, URL } from 'node:url'
import { readFileSync } from 'node:fs'

// 读取 manifest.json（兼容 Node.js ESM）
const manifest = JSON.parse(readFileSync(new URL('./manifest.json', import.meta.url), 'utf-8'))

// 使用 @crxjs/vite-plugin 实现 Chrome 扩展热更新
// 支持 popup、background、content script 的 HMR
export default defineConfig({
  plugins: [
    vue({
      // 优化 Vue 组件热更新，减少重渲染闪烁
      script: {
        defineModel: true,
        propsDestructure: true
      }
    }),
    // Ant Design Vue 按需加载：自动引入组件 + 样式
    Components({
      resolvers: [
        AntDesignVueResolver({
          importStyle: false, // 使用 CSS-in-JS，无需手动导入样式文件
          resolveIcons: true
        })
      ]
    }),
    crx({
      manifest,
      contentScripts: {
        // 关闭 CSS 自动注入，避免样式更新时的页面闪烁
        injectCss: false
      }
    })
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  base: '',
  server: {
    port: 5174,
    strictPort: false,
    hmr: {
      port: 5174,
      protocol: 'ws',
      overlay: false
    },
    watch: {
      ignored: ['**/node_modules/**', '**/dist/**']
    }
  },
  css: {
    devSourcemap: false
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // batch 窗口不在 manifest popup 中，需显式加入构建入口
    // 否则 production 构建只会打包 popup，batch 仍引用未编译的 .vue 源文件
    rollupOptions: {
      input: {
        batch: fileURLToPath(new URL('./src/batch/index.html', import.meta.url)),
        workspace: fileURLToPath(new URL('./src/workspace/index.html', import.meta.url))
      }
    }
  }
})
