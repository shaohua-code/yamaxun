<script setup>
// 图片列表组件：负责图片网格展示与选中交互
defineProps({
  images: {
    type: Array,
    required: true
  }
})

// 双向绑定：当前选中的图片 URL 集合
const selectedUrls = defineModel('selectedUrls', {
  type: Set,
  required: true
})

/**
 * 切换单个图片的选中状态
 * @param {string} url - 图片 URL
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
</script>

<template>
  <div>
    <div v-if="images.length > 0" class="grid grid-cols-4 gap-3">
      <div
        v-for="(img, index) in images"
        :key="'img-' + index"
        class="relative aspect-video bg-gray-200 rounded-lg overflow-hidden cursor-pointer"
        :class="selectedUrls.has(img.url) ? 'ring-2 ring-blue-500' : ''"
        @click="toggleSelect(img.url)"
      >
        <img
          :src="img.url"
          class="w-full h-full object-cover"
          loading="lazy"
          @error="$event.target.style.display = 'none'"
        />
        <!-- 选中勾选 -->
        <div
          v-if="selectedUrls.has(img.url)"
          class="absolute top-2 right-2 w-5 h-5 flex items-center justify-center text-white bg-blue-500 rounded"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
          </svg>
        </div>
      </div>
    </div>
    <div v-else class="flex items-center justify-center py-20">
      <p class="text-sm text-gray-400">未扫描到图片</p>
    </div>
  </div>
</template>
