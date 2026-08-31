<script setup>
import { ref, computed, watch } from "vue";
import request from "@/api/request";
import { useUserStore } from "@/stores/user";
import { message } from "ant-design-vue";

// 素材库导入弹窗：图片网格预览 → Ant Design Vue 树形选择器/多选选择器 → 弹窗打开立即 upload → 点导入执行 import 并关闭

const userStore = useUserStore();

// 弹窗显隐（双向绑定）
const visible = defineModel("visible", { type: Boolean, default: false });

const props = defineProps({
  // 待上传的素材对象列表（图片或视频，来自父组件已选中的素材）
  images: {
    type: Array,
    default: () => [],
  },
  // 来源页面 URL，用于溯源
  sourceUrl: {
    type: String,
    default: "",
  },
  // 素材类型：'images' | 'videos'，影响预览展示与兜底文件名扩展名
  mediaType: {
    type: String,
    default: "images",
  },
});

const emit = defineEmits(["success"]);

// 文件夹树数据（a-tree-select 的 treeData 格式）
const folderTreeData = ref([]);
// 选中的文件夹 ID 列表（a-tree-select v-model:value）
const selectedFolderIds = ref([]);
// 标签选项列表（a-select 的 options 格式）
const tagOptions = ref([]);
// 选中的标签 ID 列表（a-select v-model:value）
const selectedTagIds = ref([]);
// 文件夹/标签加载中
const loadingFolders = ref(false);
const loadingTags = ref(false);
// 上传中（upload 阶段）
const uploading = ref(false);
// 导入中（import 阶段，点确认时触发）
const importing = ref(false);
// upload 阶段收集的 items（供 import 使用）
const uploadedItems = ref([]);

/**
 * 拼接素材库接口基础路径：/e2e-eu-design/v1/{tenantId}/material-library
 */
function materialBase() {
  const orgId = userStore.userInfo?.tenantId || "";
  return `/e2e-eu-design/v1/${orgId || 1}/material-library`;
}

/**
 * 获取文件夹树（POST /folder/tree，无参）
 */
function fetchFolderTree() {
  return request({
    url: `${materialBase()}/folder/tree`,
    method: "post",
    data: {},
  });
}

/**
 * 获取标签列表（POST /tag/list，拉一页大数据量）
 */
function fetchTagList() {
  return request({
    url: `${materialBase()}/tag/list`,
    method: "post",
    data: { page: 1, pageSize: 200 },
  });
}

/**
 * 单文件上传（POST /material/upload，multipart/form-data）
 */
function uploadMaterialFile(file) {
  const formData = new FormData();
  formData.append("file", file);
  return request({
    url: `${materialBase()}/material/upload`,
    method: "post",
    data: formData,
    headers: { "Content-Type": "multipart/form-data" },
  });
}

/**
 * 批量导入（POST /material/import，application/json）
 */
function importMaterials(payload) {
  return request({
    url: `${materialBase()}/material/importForPlugin`,
    method: "post",
    data: payload,
  });
}

/**
 * 将接口返回的文件夹树转换为 a-tree-select 需要的 treeData 格式
 * @param {Array} nodes - 接口原始树节点
 * @returns {Array} { value, title, children } 格式的树数据
 */
function convertToTreeData(nodes) {
  if (!Array.isArray(nodes)) return [];
  return nodes.map((n) => ({
    value: n.id,
    title: n.name,
    children:
      Array.isArray(n.children) && n.children.length > 0
        ? convertToTreeData(n.children)
        : undefined,
  }));
}

/**
 * 从素材 URL 解析文件名，失败时按素材类型使用兜底文件名
 */
function extractFileName(url) {
  try {
    const pathname = new URL(url).pathname;
    const name = pathname.split("/").pop();
    if (name && name.includes(".")) return decodeURIComponent(name);
  } catch {
    // URL 解析失败时使用默认文件名
  }
  // 视频默认 mp4，图片默认 jpg
  const isVideo = props.mediaType === "videos";
  const prefix = isVideo ? "video" : "image";
  const ext = isVideo ? "mp4" : "jpg";
  return `${prefix}_${Date.now()}.${ext}`;
}

/**
 * 弹窗打开时重置状态、加载数据并立即执行 upload
 */
async function loadDataAndUpload() {
  // 重置选择与状态
  selectedFolderIds.value = [];
  selectedTagIds.value = [];
  uploadedItems.value = [];
  uploading.value = true;

  // 并行加载文件夹树与标签列表（不阻断上传流程）
  loadingFolders.value = true;
  loadingTags.value = true;
  Promise.all([fetchFolderTree(), fetchTagList()])
    .then(([folderRes, tagRes]) => {
      // 文件夹树转为 a-tree-select treeData 格式
      const folderData = folderRes?.data || {};
      folderTreeData.value = convertToTreeData(folderData.folders || []);
      // 标签列表转为 a-select options 格式
      const tagData = tagRes?.data || {};
      tagOptions.value = (tagData.records || []).map((t) => ({
        value: t.id,
        label: t.name,
      }));
    })
    .catch((err) => {
      message.error(err?.message || "加载文件夹/标签失败");
    })
    .finally(() => {
      loadingFolders.value = false;
      loadingTags.value = false;
    });

  // 校验：至少一个素材
  if (props.images.length === 0) {
    uploading.value = false;
    message.warning("请至少选择一项素材");
    return;
  }
  // 校验：单次导入 ≤ 50
  if (props.images.length > 50) {
    uploading.value = false;
    message.warning(
      `单次最多导入 50 个素材，当前选择了 ${props.images.length} 个`,
    );
    return;
  }

  // 逐个上传，收集成功结果
  const items = [];
  for (let i = 0; i < props.images.length; i++) {
    const img = props.images[i];
    try {
      const blob = await fetch(img.url).then((res) => res.blob());
      const file = new File([blob], extractFileName(img.url), {
        type: blob.type,
      });
      const res = await uploadMaterialFile(file);
      if (res.code === 0 && res.data) {
        items.push(res.data);
      }
    } catch {
      // 单文件失败不阻断
    }
  }

  uploading.value = false;
  if (items.length === 0) {
    message.error("全部上传失败，请重试");
    return;
  }
  uploadedItems.value = items;
}

// 监听弹窗显隐：打开时立即加载数据并上传
watch(visible, (val) => {
  if (val) loadDataAndUpload();
});

// 图片总数标题展示
const imageCountText = computed(
  () => `(${props.images.length}/${Math.min(props.images.length, 50)})`,
);

/**
 * 点「导入」按钮：执行 import → 成功后关闭弹窗
 */
async function handleConfirm() {
  if (uploading.value || importing.value) return;
  if (uploadedItems.value.length === 0) {
    visible.value = false;
    return;
  }

  importing.value = true;
  try {
    const res = await importMaterials({
      items: uploadedItems.value,
      source: "plugin",
      targetType: "folder",
      // 直接使用 a-tree-select/a-select 绑定的 ID 数组
      folderIds: selectedFolderIds.value,
      showcaseFolderIds: [],
      tagIds: selectedTagIds.value,
    });
    if (res.code === 0) {
      emit(
        "success",
        res.data || { successCount: 0, failCount: 0, failDetails: [] },
      );
      message.success("导入成功");
      visible.value = false;
    } else {
      message.error(res.message || "导入失败");
    }
  } catch (err) {
    message.error(err?.message || "导入失败");
  } finally {
    importing.value = false;
  }
}
</script>

<template>
  <a-modal
    :open="visible"
    :title="`导入素材${imageCountText}`"
    :mask-closable="!(uploading || importing)"
    width="900px"
    centered
    destroy-on-close
    @cancel="visible = false"
  >
    <!-- 自定义标题栏（保留原样式：导入素材 + 计数 + 全屏/关闭按钮） -->
    <template #title>
      <div class="flex items-center justify-between pr-2 -mt-1">
        <h3 class="flex items-center gap-2 text-base font-medium text-gray-800">
          导入素材
          <span class="text-sm text-gray-500 font-normal">{{
            imageCountText
          }}</span>
          <!-- 上传中/导入中 loading 图标 -->
          <svg
            v-if="uploading || importing"
            class="w-4 h-4 text-blue-500 animate-spin"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              class="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              stroke-width="4"
            ></circle>
            <path
              class="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            ></path>
          </svg>
        </h3>
        <div class="flex items-center gap-1">
          <!-- 全屏按钮 -->
          <button
            class="flex items-center justify-center w-7 h-7 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100 disabled:opacity-50"
            :disabled="uploading || importing"
            title="全屏"
          >
            <svg
              class="w-4 h-4"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              viewBox="0 0 24 24"
            >
              <path
                d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"
              ></path>
            </svg>
          </button>
          <!-- 关闭按钮 -->
          <button
            class="flex items-center justify-center w-7 h-7 text-gray-500 hover:text-gray-700 rounded hover:bg-gray-100 disabled:opacity-50"
            :disabled="uploading || importing"
            @click="visible = false"
          >
            ✕
          </button>
        </div>
      </div>
    </template>

    <!-- 内容区（无额外边距，紧贴弹窗） -->
    <div class="flex flex-col">
      <!-- 素材网格预览区 -->
      <div class="px-4 pt-4 pb-3">
        <div
          v-if="images.length > 0"
          class="grid grid-cols-7 gap-2 max-h-[240px] overflow-y-auto pr-1"
        >
          <div
            v-for="(img, index) in images"
            :key="'preview-' + index"
            class="relative aspect-square bg-gray-100 rounded-md overflow-hidden group"
          >
            <!-- 图片预览 -->
            <img
              v-if="mediaType === 'images'"
              :src="img.url"
              class="w-full h-full object-cover"
              loading="lazy"
              @error="$event.target.style.display = 'none'"
            />
            <!-- 视频预览（取首帧，静音） -->
            <video
              v-else
              :src="img.url"
              class="w-full h-full object-cover"
              preload="metadata"
              muted
              @error="$event.target.style.display = 'none'"
            ></video>
            <!-- 上传中遮罩 -->
            <div
              v-if="uploading"
              class="absolute inset-0 flex items-center justify-center bg-white/70 backdrop-blur-[1px]"
            >
              <svg
                class="w-6 h-6 text-blue-500 animate-spin"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  class="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  stroke-width="3"
                ></circle>
                <path
                  class="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                ></path>
              </svg>
            </div>
          </div>
        </div>
        <div
          v-else
          class="flex items-center justify-center py-8 text-sm text-gray-400"
        >
          暂无素材
        </div>
      </div>

      <!-- 分割线 -->
      <div class="mx-4 border-t border-gray-200"></div>

      <!-- 选择区：目标文件夹 + 添加标签（紧凑无多余边距） -->
      <div class="flex flex-col gap-2 px-4 py-3">
        <!-- 目标文件夹 -->
        <div class="flex items-center gap-2">
          <label class="shrink-0 w-[80px] text-sm text-gray-700"
            >目标文件夹</label
          >
          <a-tree-select
            v-model:value="selectedFolderIds"
            :tree-data="folderTreeData"
            :loading="loadingFolders"
            placeholder="请选择"
            multiple
            allow-clear
            tree-default-expand-all
            :dropdown-style="{ maxHeight: '260px', overflow: 'auto' }"
            :disabled="uploading || importing"
            style="flex: 1; min-width: 0"
          />
        </div>

        <!-- 添加标签 -->
        <div class="flex items-center gap-2">
          <label class="shrink-0 w-[80px] text-sm text-gray-700"
            >添加标签</label
          >
          <a-select
            v-model:value="selectedTagIds"
            :options="tagOptions"
            :loading="loadingTags"
            placeholder="请选择"
            mode="multiple"
            allow-clear
            :max-tag-count="'responsive'"
            :disabled="uploading || importing"
            style="flex: 1; min-width: 0"
          />
        </div>

        <!-- 错误提示已改用 message 全局提示 -->
      </div>
    </div>

    <!-- 底部按钮栏：使用 a-modal 的 footer 插槽 -->
    <template #footer>
      <div class="flex items-center justify-end gap-2">
        <a-button :disabled="uploading || importing" @click="visible = false"
          >取消</a-button
        >
        <a-button
          type="primary"
          :loading="importing"
          :disabled="uploading || importing || uploadedItems.length === 0"
          @click="handleConfirm"
          >{{ uploading ? "上传中..." : "导入" }}</a-button
        >
      </div>
    </template>
  </a-modal>
</template>
