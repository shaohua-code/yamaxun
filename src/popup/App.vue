<script setup>
import { ref } from "vue";
import { setStorage } from "@/utils/storage";

const loading = ref(false);
const errorMsg = ref("");

function sendMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ success: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(response);
    });
  });
}

function openMediaWindow() {
  chrome.runtime.sendMessage({ type: 'OPEN_BATCH_WINDOW' });
}

/**
 * 打开批量下载窗口
 * 先扫描当前页面媒体资源（图片和视频分离），存入 storage，再打开弹窗
 */
async function openBatchWindow() {
  loading.value = true;
  errorMsg.value = "";
  // 先获取当前标签页信息（含 tabId，供 batch 窗口重扫使用）
  try {
    const tabInfo = await sendMessage({ type: "GET_CURRENT_TAB" });
    if (!tabInfo?.tabId) throw new Error(tabInfo?.error || "未找到当前商品页面");
    const source = tabInfo
      ? { url: tabInfo.url, title: tabInfo.title, tabId: tabInfo.tabId }
      : { url: "", title: "", tabId: null };
    await setStorage("scannedSource", source);
    // 单独保存 tabId，batch 重扫时优先读取
    if (tabInfo?.tabId) {
      await setStorage("scannedSourceTabId", tabInfo.tabId);
    }

    // 扫描当前页面媒体资源（传入 tabId 确保扫的是来源页而非扩展页）
    const response = await sendMessage({ type: "CAPTURE_PRODUCT", tabId: tabInfo?.tabId });
    if (!response?.success) throw new Error(response?.error || "采集失败，请刷新商品详情页后重试");
    await setStorage("capturedProduct", response.data);
    const media = await sendMessage({ type: "SCAN_PAGE_MEDIA", tabId: tabInfo?.tabId });
    if (media?.success) {
      const capturedMedia = response.data.media || [];
      const capturedByUrl = new Map(capturedMedia.map((item) => [item.url, item]));
      const scannedMedia = [...(media.images || []), ...(media.videos || [])].map((item) => ({
        ...item,
        group: capturedByUrl.get(item.url)?.group || item.group || 'other'
      }));
      const scannedUrls = new Set(scannedMedia.map((item) => item.url));
      response.data.media = [...scannedMedia, ...capturedMedia.filter((item) => !scannedUrls.has(item.url))];
      await setStorage("capturedProduct", response.data);
      await setStorage("scannedImages", media.images || []);
      await setStorage("scannedVideos", media.videos || []);
    } else if (media?.error) {
      errorMsg.value = `商品已采集，但媒体扫描失败：${media.error}`;
    }
    chrome.runtime.sendMessage({ type: "OPEN_WORKSPACE" });
  } catch (error) {
    errorMsg.value = error.message || "采集失败";
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div>
    <div class="flex p-3 flex-col gap-2 w-[300px] bg-[#f7f8fa]">
      <div class="px-2 pt-1 pb-2">
        <div class="text-base font-semibold text-[#172033]">商品采集工作台</div>
        <div class="text-xs text-[#7b8494] mt-1">从当前详情页整理 Amazon US 上架资料</div>
      </div>
      <div
        class="flex items-center h-10 bg-[#1f64e7] text-white px-3 rounded-md cursor-pointer hover:bg-[#1855c8]"
        @click="openBatchWindow"
      >
        <span class="mr-2 text-base">↗</span>
        <span>{{ loading ? "正在采集当前商品..." : "采集当前商品" }}</span>
      </div>
      <p v-if="errorMsg" class="text-xs text-red-600 px-2">
        {{ errorMsg }}
      </p>
      <button class="h-9 bg-white border border-[#dfe3ea] rounded-md text-left px-3 text-sm text-[#344054] hover:bg-[#eef3ff]" @click="openMediaWindow">
        <span class="mr-2">▦</span> 批量媒体下载
      </button>
    </div>
  </div>
</template>
