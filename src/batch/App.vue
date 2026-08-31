<script setup>
import { ref, reactive, computed, onMounted } from "vue";
import { getStorage, setStorage } from "@/utils/storage";
import { isVideoDownloadable } from "@/utils/download";
import { downloadMediaAsZip } from "@/utils/zip";
import VideoPreviewModal from "@/batch/components/VideoPreviewModal.vue";
import ImageList from "@/batch/components/ImageList.vue";
import VideoList from "@/batch/components/VideoList.vue";


// 图片和视频分离存储
const images = ref([]);
const videos = ref([]);
// 来源页 tabId，batch 重扫时使用（避免扫到扩展页本身）
const sourceTabId = ref(null);
// 当前激活的标签页：'images' 或 'videos'
const activeTab = ref("images");

const selectedUrls = ref(new Set());
const sourcePage = reactive({ url: "", title: "" });
// 下载操作加载状态
const downloading = ref(false);
// 扫描加载状态
const scanning = ref(false);
// 扫描/操作提示
const statusMsg = ref("");
const statusType = ref("info");
// 下载任务进度列表
const downloadTasks = ref([]);
// 视频预览模态框
const previewVisible = ref(false);
const previewVideo = ref(null);

// 根据当前标签获取对应的媒体列表
const currentMedia = computed(() =>
  activeTab.value === "images" ? images.value : videos.value,
);
// 当前标签的选中数量
const selectedCount = computed(() => selectedUrls.value.size);
// 当前媒体总数
const currentTotal = computed(() => currentMedia.value.length);
// 下载任务成功/失败/跳过数量
const downloadSuccessCount = computed(
  () => downloadTasks.value.filter((t) => t.status === "success").length,
);
const downloadFailedCount = computed(
  () => downloadTasks.value.filter((t) => t.status === "failed").length,
);

/**
 * 显示状态提示条
 * @param {string} msg - 提示内容
 * @param {'info'|'error'|'success'} type - 提示类型
 */
function showStatus(msg, type = "info") {
  statusMsg.value = msg;
  statusType.value = type;
}

onMounted(async () => {

  // 优先从 storage 读取 popup 预扫描的数据（首次打开时）
  const scannedImages = await getStorage("scannedImages");
  const scannedVideos = await getStorage("scannedVideos");
  const scannedSource = await getStorage("scannedSource");
  const savedTabId = await getStorage("scannedSourceTabId");

  // 分别加载图片和视频数据
  if (scannedImages && scannedImages.length > 0) {
    images.value = scannedImages;
  }
  if (scannedVideos && scannedVideos.length > 0) {
    videos.value = scannedVideos;
  }
  selectedUrls.value = new Set();

  if (scannedSource) {
    sourcePage.url = scannedSource.url || "";
    sourcePage.title = scannedSource.title || "";
    sourceTabId.value = scannedSource.tabId || savedTabId || null;
  } else if (savedTabId) {
    sourceTabId.value = savedTabId;
  }

  // 使用来源 tabId 重扫，确保数据最新且不会扫到 batch 扩展页
  rescanCurrentPage();
});

/**
 * 重新扫描来源页面的媒体资源
 * 使用 storage 中的 sourceTabId，而非 currentWindow 的 active tab
 */
async function rescanCurrentPage() {
  if (scanning.value) return;
  scanning.value = true;
  statusMsg.value = "";

  try {
    // 获取来源 tab 信息
    const tabInfo = await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: "GET_CURRENT_TAB", tabId: sourceTabId.value },
        (res) => resolve(res),
      );
    });
    if (tabInfo) {
      sourcePage.url = tabInfo.url || "";
      sourcePage.title = tabInfo.title || "";
      if (tabInfo.tabId) sourceTabId.value = tabInfo.tabId;
    }

    if (!sourceTabId.value) {
      showStatus("未找到来源页面，请从插件弹窗重新打开批量窗口", "error");
      return;
    }

    // 向来源 tab 发起扫描（传入 tabId 避免扫错页面）
    const response = await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: "SCAN_PAGE_MEDIA", tabId: sourceTabId.value },
        (res) => resolve(res),
      );
    });

    if (response && response.success) {
      images.value = response.images || [];
      videos.value = response.videos || [];
      selectedUrls.value = new Set();
      await setStorage("scannedImages", response.images || []);
      await setStorage("scannedVideos", response.videos || []);
      showStatus(
        `扫描完成：${images.value.length} 张图片，${videos.value.length} 个视频`,
        "success",
      );
    } else {
      showStatus(response?.error || "扫描失败，请确认来源页面未关闭", "error");
    }
  } catch (err) {
    console.error("[批量下载] 扫描失败:", err);
    showStatus(err.message || "扫描失败", "error");
  } finally {
    scanning.value = false;
  }
}

/**
 * 切换标签页时清空选中状态
 * @param {'images'|'videos'} tab - 目标标签页
 */
function switchTab(tab) {
  if (activeTab.value === tab) return;
  activeTab.value = tab;
  selectedUrls.value = new Set();
  downloadTasks.value = [];
}

/**
 * 切换全选/取消全选
 */
function toggleSelectAll() {
  if (selectedUrls.value.size === currentMedia.value.length) {
    selectedUrls.value = new Set();
  } else {
    selectedUrls.value = new Set(currentMedia.value.map((item) => item.url));
  }
}

/**
 * 取消选择
 */
function handleCancel() {
  selectedUrls.value = new Set();
}

/**
 * 打开视频预览模态框
 * @param {Object} video - 视频对象
 */
function openVideoPreview(video) {
  previewVideo.value = video;
  previewVisible.value = true;
}

/**
 * 判断当前标签页下的媒体是否可下载
 * @param {Object} item - 媒体对象
 * @returns {boolean}
 */
function isMediaDownloadable(item) {
  if (activeTab.value === "videos") return isVideoDownloadable(item);
  // 图片默认可下载（排除 placeholder）
  return item.url && !item.url.startsWith("placeholder://");
}

/**
 * 批量下载当前标签页选中的媒体，打包为 ZIP 后触发下载
 * ZIP 内文件保留 URL 中的原始文件名，重复时自动加序号
 */
async function handleBatchDownload() {
  if (selectedUrls.value.size === 0) {
    return alert("请至少选择一项");
  }

  const selectedMedia = currentMedia.value.filter((item) =>
    selectedUrls.value.has(item.url),
  );
  const downloadable = selectedMedia.filter(isMediaDownloadable);

  if (downloadable.length === 0) {
    showStatus("所选资源均不可下载", "error");
    return;
  }

  downloading.value = true;
  statusMsg.value = "";
  downloadTasks.value = selectedMedia.map((item, index) => ({
    id: index,
    url: item.url,
    status: isMediaDownloadable(item) ? "pending" : "skipped",
    error: isMediaDownloadable(item) ? "" : "不可下载",
  }));

  const result = await downloadMediaAsZip({
    items: selectedMedia,
    type: activeTab.value,
    tabId: sourceTabId.value,
    onProgress(index, status, error) {
      downloadTasks.value[index].status = status;
      downloadTasks.value[index].error = error;
    },
  });

  downloading.value = false;
  if (result.success) {
    showStatus(`打包下载完成：${result.count} 个文件已加入压缩包`, "success");
  } else {
    showStatus(result.error || "压缩包下载失败", "error");
  }
}

</script>

<template>
  <div class="flex flex-col h-screen bg-[#f3f3f4]">
    <div class="px-[16px] pt-[14px] bg-white">
      <div class="flex items-center justify-between border-gray-200">
        <h1 class="text-base font-bold text-gray-800">批量下载媒体</h1>
        <div class="flex items-center gap-3">
          <span
            v-if="statusMsg"
            class="text-sm flex items-center"
            :class="
              statusType === 'error'
                ? 'text-red-500'
                : statusType === 'success'
                  ? 'text-green-500'
                  : 'text-blue-500'
            "
          >
            <img
              src="../assets/success.png"
              v-if="statusType === 'success'"
              class="w-[18px] h-[18px] mr-[4px]"
              alt=""
            />
            {{ statusMsg }}
          </span>
          <button
            class="flex items-center gap-1.5 px-[20px] py-[8px] text-sm text-[#3D3D3D] border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 font-[500]"
            :disabled="scanning"
            @click="rescanCurrentPage"
            title="重新扫描来源页面"
          >
            <img src="../assets/fetch.png" alt="" />
            {{ scanning ? "扫描中..." : "刷新" }}
          </button>
        </div>
      </div>

      <!-- 标签切换 -->
      <div class="flex">
        <button
          class="relative px-1 py-3 mr-6 text-sm font-[500] transition-colors"
          :class="
            activeTab === 'images'
              ? 'text-[#262626]'
              : 'text-[#8c8c8c] hover:text-gray-600'
          "
          @click="switchTab('images')"
        >
          图片({{ images.length }})
          <div
            v-if="activeTab === 'images'"
            class="absolute bottom-0 left-0 right-0 h-[4px] bg-[#262626] rounded-[4px]"
          ></div>
        </button>
        <button
          class="relative px-1 py-3 text-sm font-[500] transition-colors"
          :class="
            activeTab === 'videos'
              ? 'text-[#262626]'
              : 'text-[#8c8c8c] hover:text-gray-600'
          "
          @click="switchTab('videos')"
        >
          视频({{ videos.length }})
          <div
            v-if="activeTab === 'videos'"
            class="absolute bottom-0 left-0 right-0 h-[4px] bg-[#262626] rounded-[4px]"
          ></div>
        </button>
      </div>
    </div>
    <!-- 顶部栏：标题 + 状态 + 刷新 -->

    <!-- 主内容 -->
    <div class="flex flex-col flex-1 overflow-hidden">
      <div class="flex-1 p-4 overflow-auto">
        <!-- 图片标签页内容 -->
        <ImageList
          v-if="activeTab === 'images'"
          v-model:selected-urls="selectedUrls"
          :images="images"
        />

        <!-- 视频标签页内容 -->
        <VideoList
          v-if="activeTab === 'videos'"
          v-model:selected-urls="selectedUrls"
          :videos="videos"
          @preview="openVideoPreview"
        />
      </div>

      <!-- 下载进度 -->
      <div
        v-if="downloadTasks.length > 0"
        class="mx-4 mb-3 p-3 bg-white rounded-md border border-gray-200"
      >
        <div class="flex items-center justify-between mb-2">
          <h3 class="text-sm font-medium text-gray-700">下载进度</h3>
          <span class="text-xs text-gray-500">
            成功 {{ downloadSuccessCount }} / 失败 {{ downloadFailedCount }} /
            共 {{ downloadTasks.length }}
          </span>
        </div>
        <div class="flex flex-col gap-2 max-h-32 overflow-auto">
          <div
            v-for="task in downloadTasks"
            :key="'dl-' + task.id"
            class="text-xs"
          >
            <div class="flex items-center justify-between">
              <span class="truncate w-2/3" :title="task.url">{{
                task.url
              }}</span>
              <span
                class="shrink-0"
                :class="
                  task.status === 'success'
                    ? 'text-green-500'
                    : task.status === 'failed' || task.status === 'skipped'
                      ? 'text-red-500'
                      : 'text-gray-500'
                "
              >
                {{ task.error || task.status }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- 底部操作栏 -->
      <div class="flex items-center justify-between px-4 py-3 bg-white">
        <div class="flex items-center gap-3">
          <span class="text-sm text-[#969696]"
            >已选 {{ selectedCount }}/{{ currentTotal }}</span
          >
          <label
            class="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer select-none"
          >
            <input
              type="checkbox"
              :checked="selectedCount === currentTotal && currentTotal > 0"
              class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              @change="toggleSelectAll"
            />
            全选
          </label>
        </div>
        <div class="flex items-center gap-2">
          <button
            class="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
            @click="handleCancel"
          >
            取消
          </button>
          <!-- 通用下载按钮 -->
          <button
            :disabled="downloading || selectedCount === 0"
            class="px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
            @click="handleBatchDownload"
          >
            {{ downloading ? "下载中..." : "批量下载" }}
          </button>
        </div>
      </div>
    </div>

    <!-- 视频预览模态框 -->
    <VideoPreviewModal v-model:visible="previewVisible" :video="previewVideo" />

  </div>
</template>
