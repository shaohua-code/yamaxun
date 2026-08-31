<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { getStorage, setStorage } from '@/utils/storage'
import { downloadMediaAsZip } from '@/utils/zip'

const product = reactive({
  id: '', platform: 'generic', sourceUrl: '', sourceTitle: '', sourceDescription: '',
  normalized: { title: '', description: '', brand: '', attributes: {}, variants: [] },
  platformFields: {}, media: [], capturedAt: ''
})
const activeTab = ref('source')
const mediaTab = ref('main')
const saving = ref(false)
const notice = ref('')
const aiBusy = ref(false)
const selected = ref(new Set())
const backendUrl = ref('http://127.0.0.1:8000')
const listing = reactive({ title: '', bullets: ['', '', '', '', ''], description: '', searchTerms: '' })

const platformName = computed(() => ({ '1688': '1688', taobao: '淘宝', tmall: '天猫', jd: '京东', aliexpress: '速卖通', amazon: 'Amazon', ebay: 'eBay', walmart: 'Walmart', generic: '通用网页' }[product.platform] || '通用网页'))
const images = computed(() => product.media.filter((item) => item.type === 'image'))
const videos = computed(() => product.media.filter((item) => item.type === 'video'))
const detailImageCount = computed(() => images.value.filter((item) => item.group === 'detail').length)
const attributeEntries = computed(() => Object.entries(product.normalized?.attributes || {}).filter(([key, value]) => key && value).slice(0, 80))
const sourceCoverage = computed(() => {
  const checks = [product.sourceTitle, product.platformFields?.price, product.normalized?.brand, attributeEntries.value.length, images.value.length, product.sourceDescription || detailImageCount.value]
  return Math.round(checks.filter(Boolean).length / checks.length * 100)
})
const mediaTabs = computed(() => [
  { key: 'main', label: '主图', items: images.value.filter((item) => item.group === 'main') },
  { key: 'auxiliary', label: '辅图', items: images.value.filter((item) => item.group === 'auxiliary' || item.group === 'discovered' || item.group === 'sku') },
  { key: 'detail', label: '详情图', items: images.value.filter((item) => item.group === 'detail') },
  { key: 'other', label: '其他图片', items: images.value.filter((item) => !['main', 'auxiliary', 'discovered', 'detail', 'sku'].includes(item.group)) },
  { key: 'video', label: '视频', items: videos.value }
])
const visibleMedia = computed(() => mediaTabs.value.find((tab) => tab.key === mediaTab.value)?.items || [])

function show(message) { notice.value = message; window.setTimeout(() => { notice.value = '' }, 2600) }
function toggle(item) { const next = new Set(selected.value); next.has(item.url) ? next.delete(item.url) : next.add(item.url); selected.value = next }
function move(item, direction) {
  const currentItems = visibleMedia.value
  const visibleIndex = currentItems.indexOf(item)
  const target = currentItems[visibleIndex + direction]
  if (!target) return
  const index = product.media.indexOf(item)
  const targetIndex = product.media.indexOf(target)
  product.media.splice(index, 1)
  product.media.splice(targetIndex, 0, item)
}
function removeMedia(item) { product.media = product.media.filter((entry) => entry.url !== item.url); selected.value.delete(item.url) }
function setCover(item) {
  product.media.forEach((entry) => { if (entry.type === 'image' && entry.group === 'main') entry.group = 'auxiliary' })
  item.group = 'main'
  product.media = [item, ...product.media.filter((entry) => entry.url !== item.url)]
}
async function save() {
  saving.value = true
  product.normalized.title = product.normalized.title || product.sourceTitle
  const draft = { ...product, listing: { ...listing } }
  await setStorage('capturedProduct', draft)
  try {
    const response = await fetch(`${backendUrl.value}/api/v1/products${product.id ? `/${product.id}` : ''}`, { method: product.id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: product.id || undefined, platform: product.platform, source_url: product.sourceUrl, source_title: product.sourceTitle, source_data: product.platformFields, normalized_data: product.normalized, listing_data: listing, media: product.media, status: 'draft' }) })
    if (response.ok) {
      const result = await response.json()
      product.id = result.id || product.id
      await setStorage('capturedProduct', { ...product, listing: { ...listing } })
      show('草稿已保存到数据库')
    } else show('本地草稿已保存，数据库保存失败')
  } catch { show('本地草稿已保存，后端暂不可用') }
  saving.value = false
}
async function callAi(action) {
  aiBusy.value = true
  try {
    const response = await fetch(`${backendUrl.value}/api/v1/ai/rewrite`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, source: { title: product.normalized.title, description: product.normalized.description, attributes: product.normalized.attributes }, current: listing, marketplace: 'US', language: 'en-US' }) })
    if (!response.ok) throw new Error(`后端返回 ${response.status}`)
    const data = await response.json()
    Object.assign(listing, data.result || {})
    show('AI 结果已生成，请检查后应用')
  } catch (error) { show(`AI 调用失败：${error.message}`) }
  finally { aiBusy.value = false }
}
async function downloadSelected(type) {
  const items = (type === 'image' ? images.value : videos.value).filter((item) => selected.value.has(item.url))
  if (!items.length) return show('请先选择媒体')
  const sourceTabId = await getStorage('scannedSourceTabId')
  const result = await downloadMediaAsZip({ items, type: type === 'image' ? 'images' : 'videos', tabId: sourceTabId, onProgress: () => {} })
  show(result.success ? `已打包下载 ${result.count} 个文件` : result.error)
}
function setMediaTab(tab) { mediaTab.value = tab; selected.value = new Set() }
function setMediaGroup(item, group) {
  if (group === 'main') return setCover(item)
  item.group = group
  selected.value = new Set()
}
function useSourceForListing() {
  listing.title = product.normalized?.title || product.sourceTitle || listing.title
  listing.description = product.normalized?.description || product.sourceDescription || listing.description
  activeTab.value = 'listing'
  show('来源标题和详情已填入 Amazon 草稿')
}
onMounted(async () => {
  const saved = await getStorage('capturedProduct')
  if (saved) {
    Object.assign(product, saved)
    Object.assign(listing, saved.listing || {})
    listing.bullets = listing.bullets?.length ? listing.bullets : ['', '', '', '', '']
    listing.title = listing.title || product.normalized?.title || product.sourceTitle || ''
    listing.description = listing.description || product.normalized?.description || product.sourceDescription || ''
  }
  const savedBackend = await getStorage('backendUrl')
  if (savedBackend) backendUrl.value = savedBackend
})
</script>

<template>
  <main class="workspace-shell">
    <header class="topbar">
      <div><div class="eyebrow">PRODUCT WORKSPACE</div><h1>商品资料工作台</h1></div>
      <div class="top-actions"><span class="source-badge">{{ platformName }}</span><button class="button secondary" @click="save">{{ saving ? '保存中' : '保存草稿' }}</button><button class="button primary" @click="show('发布功能将在 SP-API 配置完成后启用')">确认并发布</button></div>
    </header>
    <div v-if="notice" class="notice">{{ notice }}</div>
    <section class="source-strip"><div class="source-title">{{ product.sourceTitle || '尚未采集商品' }}</div><span class="capture-summary">{{ platformName }} · {{ images.length }} 张图片 · {{ detailImageCount }} 张详情图 · {{ videos.length }} 个视频</span><a :href="product.sourceUrl" target="_blank">打开来源页面 ↗</a><span>采集于 {{ product.capturedAt ? new Date(product.capturedAt).toLocaleString() : '-' }}</span></section>
    <nav class="tabs"><button :class="{ active: activeTab === 'listing' }" @click="activeTab = 'listing'">Amazon US Listing</button><button :class="{ active: activeTab === 'source' }" @click="activeTab = 'source'">来源资料</button><button :class="{ active: activeTab === 'media' }" @click="activeTab = 'media'">图片与视频 <span>{{ product.media.length }}</span></button><button :class="{ active: activeTab === 'settings' }" @click="activeTab = 'settings'">连接设置</button></nav>
    <section v-if="activeTab === 'listing'" class="content-grid">
      <div class="panel editor-panel"><div class="panel-heading"><div><div class="panel-kicker">TARGET MARKET</div><h2>Amazon 美国站</h2></div><span class="state pending">待审核</span></div><label>Listing Title <span>{{ listing.title.length }}/200</span><textarea v-model="listing.title" rows="3" placeholder="输入或从来源资料复制标题"></textarea></label><label>Bullet Points <span>{{ listing.bullets.length }}/5</span><textarea v-for="(_, index) in listing.bullets" :key="index" v-model="listing.bullets[index]" rows="2" :placeholder="`Bullet Point ${index + 1}`"></textarea></label><label>Product Description<textarea v-model="listing.description" rows="8" placeholder="编辑商品详情"></textarea></label><label>Search Terms<textarea v-model="listing.searchTerms" rows="2" placeholder="英文搜索词，用空格分隔"></textarea></label></div>
      <aside class="side-stack"><div class="panel ai-panel"><div class="panel-heading"><div><div class="panel-kicker">ON DEMAND</div><h2>AI 文案助手</h2></div><span class="ai-dot"></span></div><p>只在你点击时调用模型，生成结果不会自动覆盖草稿。</p><button class="button ai-button" :disabled="aiBusy" @click="callAi('listing')">✦ {{ aiBusy ? '生成中...' : '生成完整 Listing' }}</button><button class="text-button" :disabled="aiBusy" @click="callAi('title')">润色标题</button><button class="text-button" :disabled="aiBusy" @click="callAi('bullets')">生成五点描述</button><button class="text-button" :disabled="aiBusy" @click="callAi('description')">翻译 / 重写详情</button></div><div class="panel checklist"><div class="panel-heading"><h2>发布检查</h2><span class="state warning">3 项待确认</span></div><div>○ 标题长度和关键词</div><div>○ 五点描述是否有事实依据</div><div>○ 主图与品牌授权</div><div>○ 类目必填属性</div></div></aside>
    </section>
    <section v-else-if="activeTab === 'source'" class="source-page"><div class="source-overview"><div><div class="panel-kicker">SOURCE PROFILE</div><h2>{{ platformName }} 商品资料</h2><p class="muted">只展示当前页面识别到的商品信息，不把店铺、评价和平台推荐内容混入商品资料。</p></div><div class="coverage"><strong>{{ sourceCoverage }}%</strong><span>资料完整度</span></div><button class="button primary" @click="useSourceForListing">填入 Amazon 草稿</button></div><div class="source-layout"><div class="source-main"><section class="panel"><div class="panel-heading"><div><div class="panel-kicker">PRODUCT CORE</div><h2>商品基础信息</h2></div><span class="state captured">{{ platformName }}</span></div><label>商品标题<textarea v-model="product.sourceTitle" rows="3"></textarea></label><label>商品详情<textarea v-model="product.sourceDescription" rows="10" placeholder="详情文字会显示在这里"></textarea></label></section><section class="panel"><div class="panel-heading"><div><div class="panel-kicker">DETAIL CONTENT</div><h2>商品详情内容</h2></div><span class="state edited">{{ detailImageCount }} 张详情图</span></div><div class="detail-preview"><img v-for="item in mediaTabs.find((tab) => tab.key === 'detail')?.items.slice(0, 8)" :key="item.url" :src="item.url" loading="lazy"><p v-if="!detailImageCount">暂无识别到详情图，请滚动到商品详情区域后重新采集。</p></div></section></div><aside class="source-side"><section class="panel"><div class="panel-heading"><h2>关键字段</h2><span class="state edited">可编辑</span></div><div class="key-fields"><label>价格<input v-model="product.platformFields.price"></label><label>品牌<input v-model="product.platformFields.brand"></label><label>SKU / 货号<input v-model="product.platformFields.sku"></label><label>店铺<input v-model="product.platformFields.shop"></label><label>起批量<input v-model="product.platformFields.moq"></label><label>库存<input v-model="product.platformFields.stock"></label><label>发货地<input v-model="product.platformFields.shippingOrigin"></label></div></section><section class="panel"><div class="panel-heading"><h2>商品属性</h2><span>{{ attributeEntries.length }} 项</span></div><div class="attribute-list"><div v-for="([key, value]) in attributeEntries" :key="key"><b>{{ key }}</b><input :value="value" @input="product.normalized.attributes[key] = $event.target.value"></div><p v-if="!attributeEntries.length" class="muted">暂无属性数据</p></div></section></aside></div></section>
    <section v-else-if="activeTab === 'media'" class="media-section"><div class="media-toolbar"><div><div class="panel-kicker">ASSET LIBRARY</div><h2>图片与视频 <small>{{ images.length }} 图片 · {{ videos.length }} 视频</small></h2></div><div><button class="button secondary" @click="downloadSelected(mediaTab === 'video' ? 'video' : 'image')">下载当前分类</button><button class="button secondary" @click="selected = new Set(visibleMedia.map((item) => item.url))">全选当前分类</button></div></div><div class="media-tabs"><button v-for="tab in mediaTabs" :key="tab.key" :class="{ active: mediaTab === tab.key }" @click="setMediaTab(tab.key)">{{ tab.label }} <span>{{ tab.items.length }}</span></button></div><div class="media-grid"><article v-for="item in visibleMedia" :key="item.url" class="media-item" :class="{ selected: selected.has(item.url) }" @click="toggle(item)"><img v-if="item.type === 'image'" :src="item.url" loading="lazy" @error="$event.target.parentElement.classList.add('broken')"><video v-else :src="item.url" :poster="item.poster" muted controls></video><div class="media-overlay"><span>{{ item.group === 'main' ? '主图' : item.group === 'detail' ? '详情图' : item.group === 'other' ? '其他' : item.type === 'image' ? '辅图' : '视频' }}</span><span><button title="前移" @click.stop="move(item, -1)">↑</button><button title="后移" @click.stop="move(item, 1)">↓</button><button title="删除" @click.stop="removeMedia(item)">×</button></span></div><div v-if="item.type === 'image'" class="media-classify" @click.stop><button :class="{ active: item.group === 'main' }" @click="setMediaGroup(item, 'main')">主图</button><button :class="{ active: item.group === 'auxiliary' }" @click="setMediaGroup(item, 'auxiliary')">辅图</button><button :class="{ active: item.group === 'detail' }" @click="setMediaGroup(item, 'detail')">详情图</button><button :class="{ active: item.group === 'other' }" @click="setMediaGroup(item, 'other')">其他</button></div></article><div v-if="!visibleMedia.length" class="empty-state">当前分类暂无媒体。请在商品详情页完整加载后重新采集，详情图通常需要滚动到详情区域才能被页面加载。</div></div></section>
    <section v-else class="settings-section"><div class="panel narrow-panel"><div class="panel-kicker">LOCAL SERVICE</div><h2>连接设置</h2><label>Python 后端地址<input v-model="backendUrl" @change="setStorage('backendUrl', backendUrl)"></label><p>后端用于 AI 调用、商品记录和后续 Amazon SP-API。API Key 保存在后端，不进入插件。</p><button class="button primary" @click="save">保存连接设置</button></div></section>
  </main>
</template>
