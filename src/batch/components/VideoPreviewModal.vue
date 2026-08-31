<script setup>
import { computed, ref } from 'vue'
import { isVideoPlayable } from '@/utils/download'

// 双向绑定：是否显示模态框
const visible = defineModel('visible', { type: Boolean, default: false })

const props = defineProps({
  video: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['openTab'])

// 视频播放错误提示
const playError = ref('')
// 是否已复制链接
const copied = ref(false)

// 是否可内嵌播放（直链视频）
const canPlayInline = computed(() => isVideoPlayable(props.video))
// 是否为嵌入视频
const isEmbed = computed(() => !!props.video?.isEmbed)
// 是否为 HLS 流
const isHls = computed(() => !!props.video?.isHls)
// 实际播放地址（占位 URL 不可播放）
const playUrl = computed(() => {
  if (!props.video?.url || props.video.url.startsWith('placeholder://')) return ''
  return props.video.url
})

/**
 * 关闭预览模态框
 */
function handleClose() {
  visible.value = false
  playError.value = ''
  copied.value = false
}

/**
 * 在新标签页打开视频地址
 */
function handleOpenTab() {
  if (!props.video?.url || props.video.url.startsWith('placeholder://')) return
  emit('openTab', props.video.url)
  chrome.tabs.create({ url: props.video.url })
}

/**
 * 复制视频链接到剪贴板
 */
async function handleCopyUrl() {
  if (!props.video?.url) return
  try {
    await navigator.clipboard.writeText(props.video.url)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch {
    playError.value = '复制链接失败'
  }
}

/**
 * 视频播放失败回调
 */
function handleVideoError() {
  playError.value = isHls.value
    ? 'HLS 流可能无法在此直接播放，请复制链接后使用专用播放器'
    : '视频加载失败，可能是跨域或资源已失效'
}
</script>

<template>
  <div
    v-if="visible && video"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
    @click.self="handleClose"
  >
    <div class="relative flex flex-col w-full max-w-2xl max-h-[90vh] mx-4 bg-white rounded-lg shadow-xl overflow-hidden">
      <!-- 标题栏 -->
      <div class="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <h3 class="text-sm font-medium text-gray-800 truncate">
          {{ video.isEmbed ? (video.platform || '嵌入视频') : '视频预览' }}
        </h3>
        <button
          class="flex items-center justify-center w-8 h-8 text-gray-500 rounded hover:bg-gray-100"
          @click="handleClose"
        >
          ✕
        </button>
      </div>

      <!-- 内容区 -->
      <div class="flex flex-col p-4 gap-3 overflow-auto">
        <!-- 直链视频：内嵌播放器 -->
        <div v-if="canPlayInline && playUrl" class="relative w-full bg-black rounded overflow-hidden">
          <video
            :src="playUrl"
            controls
            class="w-full max-h-96"
            @error="handleVideoError"
          />
        </div>

        <!-- 嵌入视频：无法直接播放 -->
        <div v-else-if="isEmbed" class="flex flex-col items-center gap-3 py-8 px-4 bg-gray-50 rounded">
          <p class="text-sm text-gray-600 text-center">嵌入视频无法在此直接播放，请在新标签页中打开原页面观看</p>
          <button
            class="px-4 py-2 text-sm text-white bg-purple-500 rounded hover:bg-purple-600"
            @click="handleOpenTab"
          >
            在新标签页打开
          </button>
        </div>

        <!-- 需交互加载 / 无有效 src -->
        <div v-else class="flex flex-col items-center gap-3 py-8 px-4 bg-gray-50 rounded">
          <p class="text-sm text-gray-600 text-center">该视频需在原页面交互后才能加载，暂无法预览</p>
          <img
            v-if="video.poster"
            :src="video.poster"
            class="max-w-full max-h-48 rounded object-contain"
            alt="视频封面"
          />
        </div>

        <!-- 播放错误提示 -->
        <p v-if="playError" class="text-xs text-red-500 text-center">{{ playError }}</p>

        <!-- 视频信息 -->
        <div class="p-3 bg-gray-50 rounded">
          <p class="text-xs text-gray-500 break-all">{{ video.url }}</p>
          <div class="mt-2 flex flex-wrap gap-2">
            <span v-if="video.platform" class="px-2 py-0.5 text-xs text-purple-600 bg-purple-50 rounded">{{ video.platform }}</span>
            <span v-if="isHls" class="px-2 py-0.5 text-xs text-orange-600 bg-orange-50 rounded">HLS 流</span>
            <span v-if="video.isEmbed" class="px-2 py-0.5 text-xs text-orange-600 bg-orange-50 rounded">嵌入</span>
            <span v-if="video.needsInteraction" class="px-2 py-0.5 text-xs text-yellow-600 bg-yellow-50 rounded">需交互加载</span>
          </div>
        </div>

        <!-- 操作按钮 -->
        <div class="flex gap-2">
          <button
            class="flex-1 px-3 py-2 text-sm text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
            @click="handleCopyUrl"
          >
            {{ copied ? '已复制' : '复制链接' }}
          </button>
          <button
            v-if="!video.url.startsWith('placeholder://')"
            class="flex-1 px-3 py-2 text-sm text-white bg-blue-500 rounded hover:bg-blue-600"
            @click="handleOpenTab"
          >
            新标签页打开
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
