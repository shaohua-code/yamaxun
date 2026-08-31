<script setup>
import { ref } from 'vue'

// 视频列表组件：负责视频列表展示、选中交互与预览触发
defineProps({
  videos: {
    type: Array,
    required: true
  }
})

// 双向绑定：当前选中的视频 URL 集合
const selectedUrls = defineModel('selectedUrls', {
  type: Set,
  required: true
})

// 视频预览事件
const emit = defineEmits(['preview'])

// poster 加载失败的 URL 集合
const posterFailedSet = ref(new Set())

/**
 * 切换单个视频的选中状态
 * @param {string} url - 视频 URL
 */
function toggleSelect(url) {
  const next = new Set(selectedUrls.value)
  if (next.has(url)) {
    next.delete(url)
  } else {
    next.add(url)
  }
  selectedUrls.value = next
}

/**
 * poster 加载失败时标记，显示占位符
 * @param {string} url - poster URL
 */
function handlePosterError(url) {
  posterFailedSet.value = new Set([...posterFailedSet.value, url])
}

/**
 * 打开视频预览
 * @param {Object} video - 视频对象
 * @param {Event} e - 点击事件
 */
function openPreview(video, e) {
  e.stopPropagation()
  emit('preview', video)
}

/**
 * 获取视频标题文本
 * @param {Object} video - 视频对象
 * @returns {string}
 */
function getVideoTitle(video) {
  if (video.isEmbed) return video.platform || '嵌入视频'
  if (video.isHls) return 'HLS 流'
  return '视频文件'
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <div
      v-for="(video, index) in videos"
      :key="'video-' + index"
      class="relative flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-200 cursor-pointer"
      :class="selectedUrls.has(video.url) ? 'ring-2 ring-blue-500 border-blue-500' : 'hover:border-gray-300'"
      @click="toggleSelect(video.url)"
    >
      <!-- 视频缩略图：点击预览 -->
      <div
        class="relative shrink-0 w-24 h-16 bg-[#b2b2b2] rounded-[4px] overflow-hidden"
        @click="openPreview(video, $event)"
      >
        <img
          v-if="video.poster && !posterFailedSet.has(video.poster)"
          :src="video.poster"
          class="w-full h-full object-cover"
          loading="lazy"
          @error="handlePosterError(video.poster)"
        />
        <!-- 占位 / 播放图标 -->
        <div class="absolute inset-0 flex items-center justify-center">
           <img src="../../assets/play.png" alt="">
        </div>
      </div>
      <!-- 视频信息 -->
      <div class="flex-1 min-w-0">
        <p class="text-sm font-medium text-gray-800 truncate">
          {{ getVideoTitle(video) }}
        </p>
        <p class="mt-1 text-xs text-gray-400 truncate" :title="video.url">{{ video.url }}</p>
      </div>
      <!-- 选中勾选 -->
      <div
        v-if="selectedUrls.has(video.url)"
        class="shrink-0 w-5 h-5 flex items-center justify-center text-white bg-blue-500 rounded"
      >
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
        </svg>
      </div>
    </div>
    <div v-if="videos.length === 0" class="flex items-center justify-center py-20">
      <p class="text-sm text-gray-400">未扫描到视频</p>
    </div>
  </div>
</template>
