/**
 * Chrome 插件内容脚本
 * 职责：扫描页面图片、记录右键位置、查找右键点击图片
 */

// 防止 manifest 自动注入 + 编程式注入重复注册监听器
if (!globalThis.__IMAGE_COLLECTOR_CS__) {
globalThis.__IMAGE_COLLECTOR_CS__ = true

// 记录最近一次右键点击的坐标
let lastRightClickPos = { x: 0, y: 0 }

// 监听右键菜单弹出事件，记录鼠标位置
document.addEventListener('contextmenu', (e) => {
  lastRightClickPos = { x: e.clientX, y: e.clientY }
})

/**
 * 安全执行函数，捕获错误
 * @param {Function} fn
 * @param {string} name
 */
function safe(fn, name) {
  try {
    return fn()
  } catch (err) {
    console.error(`[图片采集助手] ${name} 失败:`, err)
    return null
  }
}

/**
 * 获取元素的背景图片 URL
 * @param {Element} el
 * @returns {string|null}
 */
function getBackgroundImage(el) {
  return safe(() => {
    const style = window.getComputedStyle(el)
    const bg = style.backgroundImage
    if (!bg || bg === 'none') return null
    const match = bg.match(/url\(["']?([^"')]+)["']?\)/)
    return match ? match[1] : null
  }, 'getBackgroundImage')
}

/**
 * 判断 URL 是否有效图片地址
 * @param {string} url
 */
function isValidImageUrl(url) {
  if (!url) return false
  if (url.startsWith('data:')) return false
  return true
}

/**
 * 将相对 URL 转为绝对 URL
 * @param {string} url
 */
function toAbsoluteUrl(url) {
  if (!url) return null
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('//')) return url
  try {
    return new URL(url, location.href).href
  } catch {
    return null
  }
}

/**
 * 提取 srcset 中第一张图片 URL
 * @param {string} srcset
 */
function parseSrcset(srcset) {
  if (!srcset) return null
  const first = srcset.split(',')[0].trim().split(' ')[0]
  return toAbsoluteUrl(first)
}

/**
 * 查找右键点击位置的图片
 * 规则：
 * 1. 鼠标正下方是 img 标签，直接取该 img
 * 2. 否则从点击元素向上遍历父元素，取第一个有 background-image 的元素
 * 3. 都没有则返回 null（不取不关联的图片）
 * @param {number} x
 * @param {number} y
 * @returns {Object|null}
 */
function findImageAt(x, y) {
  return safe(() => {
    const directEl = document.elementFromPoint(x, y)
    if (directEl && directEl.tagName === 'IMG') {
      const src = directEl.currentSrc || directEl.src
      if (isValidImageUrl(src)) {
        return {
          url: toAbsoluteUrl(src),
          alt: directEl.alt || '',
          width: directEl.naturalWidth,
          height: directEl.naturalHeight
        }
      }
    }

    let el = directEl
    while (el && el !== document.body && el !== document.documentElement) {
      const bgUrl = getBackgroundImage(el)
      if (isValidImageUrl(bgUrl)) {
        const rect = el.getBoundingClientRect()
        return {
          url: toAbsoluteUrl(bgUrl),
          alt: '',
          width: rect.width,
          height: rect.height
        }
      }
      el = el.parentElement
    }

    return null
  }, 'findImageAt')
}

function imageUrlsFromElement(element) {
  const values = [
    element?.currentSrc,
    element?.src,
    element?.getAttribute?.('src'),
    element?.dataset?.src,
    element?.dataset?.original,
    element?.dataset?.lazySrc,
    element?.dataset?.image,
    element?.getAttribute?.('data-old-hires'),
    element?.getAttribute?.('data-image-url'),
    element?.getAttribute?.('data-original-src'),
    element?.getAttribute?.('content')
  ]
  const srcset = element?.getAttribute?.('srcset') || element?.dataset?.srcset || ''
  srcset.split(',').forEach((entry) => values.push(entry.trim().split(/\s+/)[0]))
  return [...new Set(values.map(toAbsoluteUrl).filter(isValidImageUrl))]
}

function imageKey(url) {
  try {
    const parsed = new URL(url)
    let path = parsed.pathname
    if (/alicdn|alibaba|cbu0\d/.test(parsed.hostname)) {
      path = path.replace(/\.(jpe?g|png|webp)_\.webp$/i, '.$1')
      path = path.replace(/_\d+x\d+(?:q\d+)?\.(jpe?g|png|webp)$/i, '')
    }
    return `${parsed.hostname}${path}`.toLowerCase()
  } catch {
    return String(url || '').split('?')[0].toLowerCase()
  }
}

function platformMediaConfig(platform) {
  const configs = {
    '1688': {
      main: '.preview-img.active-preview-img, .gallery-main .active-preview-img',
      gallery: '.preview-img, .gallery-main img, .gallery-thumbnails img',
      detail: '.module-od-product-description img, .module-od-product-description picture img, [class*="product-description"] img',
      exclude: '[class*="rate"] img, [class*="review"] img, [class*="avatar"] img, [class*="recommend"] img, [class*="logo"] img'
    },
    amazon: {
      main: '#landingImage, #imgBlkFront, #ebooksImgBlkFront',
      gallery: '#altImages li img, #altImages img, #imageBlock img, #imageBlock_feature_div img',
      detail: '#aplus img, #aplus_feature_div img, #productDescription img, [class*="aplus"] img',
      exclude: '#customerReviews img, #reviewsMedley img, [class*="recommend"] img, [class*="similar"] img'
    },
    aliexpress: {
      main: '[class*="image-viewer"] img[class*="magnifier"], [class*="image-viewer"] img:first-of-type, [data-role="image-viewer"] img:first-of-type, .images-view-item img:first-of-type',
      gallery: '[class*="image-viewer"] img, [class*="image-list"] img, [class*="slider"] img, [data-role="image-viewer"] img',
      detail: '#product-description img, [class*="detail-desc"] img, [class*="product-description"] img',
      exclude: '[class*="review"] img, [class*="recommend"] img, [class*="seller"] img'
    },
    ebay: {
      main: '#vi_main_img_fs, .ux-image-carousel-item:first-child img, [class*="image-carousel"] img:first-child, [class*="image-grid"] img:first-child',
      gallery: '.ux-image-carousel-item img, [class*="image-carousel"] img, [class*="image-grid"] img, #PicturePanel img',
      detail: '#desc_div img, #viTabs_0_is img, #itemDescription img, [class*="item-description"] img',
      exclude: '[class*="review"] img, [class*="recommend"] img, [class*="seller"] img'
    },
    jd: {
      main: '#spec-img, #preview .main-img, #preview img:first-of-type',
      gallery: '#preview img, .spec-list img, [class*="preview"] img',
      detail: '#J-detail-content img, #detail img, [class*="detail-content"] img',
      exclude: '#comment img, [class*="comment"] img, [class*="recommend"] img'
    },
    taobao: {
      main: '#J_ImgBooth, .tb-gallery img:first-of-type, [class*="mainPic"] img:first-of-type',
      gallery: '.tb-gallery img, #J_UlThumb img, [class*="PicGallery"] img, [class*="mainPic"] img',
      detail: '#description img, [class*="desc-root"] img, [class*="detail-content"] img',
      exclude: '[class*="review"] img, [class*="recommend"] img, [class*="shop"] img'
    },
    tmall: {
      main: '#J_ImgBooth, .tb-gallery img:first-of-type, [class*="mainPic"] img:first-of-type',
      gallery: '.tb-gallery img, #J_UlThumb img, [class*="PicGallery"] img, [class*="mainPic"] img',
      detail: '#description img, [class*="desc-root"] img, [class*="detail-content"] img',
      exclude: '[class*="review"] img, [class*="recommend"] img, [class*="shop"] img'
    },
    walmart: {
      main: '[data-testid="hero-image"], [data-testid="product-image"], [data-automation-id="product-image"]',
      gallery: '[data-testid*="media"] img, [data-testid*="product-image"] img, [data-automation-id*="product-image"] img, [class*="carousel"] img',
      detail: '[data-testid*="description"] img, [data-automation-id*="description"] img, [class*="description"] img',
      exclude: '[data-testid*="review"] img, [data-testid*="recommend"] img, [class*="recommend"] img'
    },
    tiktok: {
      main: '[data-e2e="product-image"] img:first-of-type, [data-testid*="product-image"] img:first-of-type',
      gallery: '[data-e2e="product-image"] img, [data-testid*="product-image"] img, [class*="carousel"] img',
      detail: '[data-e2e*="description"] img, [data-testid*="description"] img',
      exclude: '[data-e2e*="review"] img, [data-testid*="recommend"] img'
    },
    temu: {
      main: '[data-testid*="main-image"] img, [data-testid="商品主图"] img',
      gallery: '[data-testid*="image"] img, [class*="carousel"] img',
      detail: '[data-testid*="description"] img, [class*="description"] img',
      exclude: '[data-testid*="review"] img, [data-testid*="recommend"] img'
    },
    shopee: {
      main: '[class*="product-image"] img:first-of-type, [class*="image-carousel"] img:first-of-type',
      gallery: '[class*="product-image"] img, [class*="image-carousel"] img, [class*="thumbnail"] img',
      detail: '[class*="product-detail"] img, [class*="description"] img, [class*="detail"] img',
      exclude: '[class*="review"] img, [class*="recommend"] img, [class*="shop"] img'
    },
    lazada: {
      main: '[data-qa-locator="product-gallery"] img:first-of-type, [class*="gallery-preview"] img:first-of-type',
      gallery: '[data-qa-locator="product-gallery"] img, [class*="gallery-preview"] img, [class*="product-gallery"] img',
      detail: '[data-qa-locator="product-description"] img, [class*="product-description"] img, [class*="detail"] img',
      exclude: '[class*="review"] img, [class*="recommend"] img, [class*="seller"] img'
    },
    shein: {
      main: '[class*="product-intro"] img:first-of-type, [class*="product-detail"] img:first-of-type',
      gallery: '[class*="product-intro"] img, [class*="product-detail"] img, [class*="gallery"] img',
      detail: '[class*="product-desc"] img, [class*="description"] img, [class*="detail"] img',
      exclude: '[class*="review"] img, [class*="recommend"] img, [class*="similar"] img'
    },
    generic: {
      main: '[itemprop="image"], meta[property="og:image"]',
      gallery: '[class*="product"] img, [class*="gallery"] img, [class*="carousel"] img, [class*="slider"] img, [itemprop="image"]',
      detail: '[itemprop="description"] img, [class*="product-description"] img, [class*="description"] img, [class*="detail-content"] img, [class*="detail"] img',
      exclude: '[class*="review"] img, [class*="rating"] img, [class*="recommend"] img, [class*="related"] img, [class*="seller"] img, [class*="logo"] img, [class*="avatar"] img'
    }
  }
  return configs[platform] || configs.generic
}

function collectPlatformMediaHints() {
  const hints = { main: new Set(), auxiliary: new Set(), detail: new Set(), other: new Set() }
  const platform = detectPlatform()
  const selectors = platformMediaConfig(platform)
  if (!selectors) return hints
  const groups = { main: selectors.main, auxiliary: selectors.gallery, detail: selectors.detail, other: selectors.exclude }
  Object.entries(groups).forEach(([group, selector]) => {
    if (!selector) return
    document.querySelectorAll(selector).forEach((element) => {
      imageUrlsFromElement(element).forEach((url) => hints[group].add(imageKey(url)))
    })
  })
  // 平台没有当前主图标记时，商品画廊第一张才作为主图兜底。
  if (!hints.main.size && selectors.gallery) {
    const firstGallery = document.querySelector(selectors.gallery)
    imageUrlsFromElement(firstGallery).forEach((url) => hints.main.add(imageKey(url)))
  }
  hints.main.forEach((key) => hints.auxiliary.delete(key))
  return hints
}

/**
 * 扫描页面所有图片
 * 参考 Eagle-Like：优先使用 document.images，再补充背景图、懒加载等
 * @returns {Array}
 */
function scanImages() {
  const result = []
  const seen = new Map()
  const mediaHints = collectPlatformMediaHints()
  const logs = []
  const MIN_IMG_SIZE = 60
  const groupPriority = { other: 0, auxiliary: 1, gallery: 1, detail: 2, main: 3 }

  function addImage(url, width = 0, height = 0, alt = '', group = 'other') {
    const absoluteUrl = toAbsoluteUrl(url)
    if (!isValidImageUrl(absoluteUrl)) return
    const key = imageKey(absoluteUrl)
    const existing = seen.get(key)
    if (existing) {
      if ((groupPriority[group] || 0) > (groupPriority[existing.group] || 0)) existing.group = group
      if ((width || 0) * (height || 0) > (existing.width || 0) * (existing.height || 0)) {
        existing.url = absoluteUrl
        existing.width = width
        existing.height = height
      }
      if (!existing.alt && alt) existing.alt = alt
      return
    }
    const item = { type: 'image', url: absoluteUrl, alt, width, height, group }
    seen.set(key, item)
    result.push(item)
  }

  function imageGroup(img) {
    const context = `${img.className || ''} ${img.parentElement?.className || ''} ${img.closest('section, div, li')?.className || ''}`.toLowerCase()
    const src = img.currentSrc || img.src || img.dataset.src || img.dataset.original || ''
    const platform = detectPlatform()
    const keys = imageUrlsFromElement(img).map(imageKey)
    if (keys.some((key) => mediaHints.main.has(key))) return 'main'
    if (keys.some((key) => mediaHints.detail.has(key))) return 'detail'
    if (keys.some((key) => mediaHints.auxiliary.has(key))) return 'auxiliary'
    if (keys.some((key) => mediaHints.other.has(key))) return 'other'
    if (platform === '1688') {
      if (/rate\.jpg|buyer|评价|晒单/.test(`${src} ${context}`)) return 'other'
      if (img.closest('.module-od-product-description, [class*="product-description"]')) return 'detail'
      return 'other'
    }
    if (platform === 'amazon') {
      if (img.matches('#landingImage, #imgBlkFront')) return 'main'
      if (img.closest('#altImages, #imageBlock, #imageBlock_feature_div')) return 'auxiliary'
      if (img.closest('#aplus, #aplus_feature_div, #productDescription, [class*="aplus"]')) return 'detail'
    }
    if (platform === 'aliexpress') {
      if (img.closest('[class*="image-viewer"]') && /main|magnifier/.test(context)) return 'main'
      if (img.closest('[class*="image-viewer"], [class*="slider"]')) return 'auxiliary'
      if (img.closest('#product-description, [class*="detail-desc"], [class*="product-description"]')) return 'detail'
    }
    if (platform === 'ebay') {
      if (img.closest('[class*="image-carousel"], [class*="image-grid"]')) return 'auxiliary'
      if (img.closest('#viTabs_0_is, [class*="item-description"], [class*="description"]')) return 'detail'
    }
    if (platform === 'jd') {
      if (img.matches('#spec-img') || img.closest('#preview')) return img.matches('#spec-img') ? 'main' : 'auxiliary'
      if (img.closest('#J-detail-content, #detail, [class*="detail-content"]')) return 'detail'
    }
    if (platform === 'taobao' || platform === 'tmall') {
      if (img.closest('.tb-gallery, [class*="PicGallery"], [class*="mainPic"]')) return 'auxiliary'
      if (img.closest('#description, [class*="desc-root"], [class*="detail-content"]')) return 'detail'
    }
    if (platform === 'walmart') {
      if (img.matches('[data-testid="hero-image"]')) return 'main'
      if (img.closest('[data-testid*="media"], [class*="carousel"]')) return 'auxiliary'
      if (img.closest('[data-testid*="description"], [class*="description"]')) return 'detail'
    }
    if (platform === 'shopee' || platform === 'lazada' || platform === 'shein' || platform === 'tiktok' || platform === 'temu') {
      if (img.closest('[class*="product-image"], [class*="image-carousel"], [class*="gallery-preview"]') && /first|main|hero/.test(`${img.className} ${context}`)) return 'main'
      if (img.closest('[class*="product-image"], [class*="image-carousel"], [class*="gallery"], [class*="carousel"], [class*="thumbnail"]')) return 'auxiliary'
      if (img.closest('[class*="description"], [class*="detail"], [class*="product-desc"]')) return 'detail'
    }
    const previousHeading = [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')]
      .filter((heading) => heading.compareDocumentPosition(img) & Node.DOCUMENT_POSITION_FOLLOWING)
      .at(-1)
    const headingText = previousHeading ? (previousHeading.innerText || previousHeading.textContent || '') : ''
    if (/商品详情|图文详情|product detail|description/.test(headingText)) return 'detail'
    if (/detail|description|详情|图文|介绍|content/.test(context)) return 'detail'
    if (/sku|swatch|variant|spec|color|size|属性|规格|颜色|尺寸|thumb|thumbnail/.test(context)) return 'auxiliary'
    if (/logo|icon|avatar|banner|ad|recommend|related|推荐|广告/.test(context)) return 'other'
    return 'other'
  }

  // 1. document.images 获取页面所有 img 标签（最稳定）
  safe(() => {
    const imgs = Array.from(document.images || [])
    logs.push(`document.images 数量: ${imgs.length}`)
    for (const img of imgs) {
      const src = img.currentSrc || img.src
      if (!src || src.startsWith('data:')) continue
      const w = img.naturalWidth || img.width || 0
      const h = img.naturalHeight || img.height || 0
      if ((w && w < MIN_IMG_SIZE) || (h && h < MIN_IMG_SIZE)) continue
      addImage(src, w, h, img.alt || '', imageGroup(img))
      if (result.length >= 200) break
    }
  }, '扫描 document.images')

  // 2. 懒加载属性
  safe(() => {
    document.querySelectorAll('img[data-src], img[data-original]').forEach((img) => {
      const src = img.dataset.src || img.dataset.original
      if (src && !src.startsWith('data:')) {
        addImage(src, img.naturalWidth, img.naturalHeight, img.alt || '', imageGroup(img))
      }
    })
  }, '扫描懒加载图片')

  // 3. picture source
  safe(() => {
    document.querySelectorAll('picture source').forEach((source) => {
      addImage(source.srcset ? parseSrcset(source.srcset) : source.src, 0, 0, '', 'auxiliary')
    })
  }, '扫描 picture source')

  // 4. svg image
  safe(() => {
    document.querySelectorAll('svg').forEach((svg) => {
      svg.querySelectorAll('image').forEach((img) => {
        addImage(img.href?.baseVal || img.getAttribute('href') || img.getAttribute('xlink:href'), 0, 0, '', 'other')
      })
    })
  }, '扫描 svg image')

  // 5. CSS 背景图
  safe(() => {
    document.querySelectorAll('*').forEach((el) => {
      const bgUrl = getBackgroundImage(el)
      if (bgUrl) addImage(bgUrl, 0, 0, '', 'other')
    })
  }, '扫描 CSS 背景图')

  const galleryImages = result.filter((item) => item.group === 'gallery' || item.group === 'auxiliary')
  const existingMain = result.find((item) => item.group === 'main')
  const productImages = result.filter((item) => item.group !== 'detail' && item.group !== 'other')
  const galleryMain = galleryImages
    .map((item, index) => ({
      item,
      // 首图优先；尺寸只用于同一商品画廊内的平局决策。
      score: (index === 0 ? 1000000000 : 0) + (item.width || 0) * (item.height || 0)
    }))
    .sort((a, b) => b.score - a.score)[0]?.item
  const productCandidate = productImages
    .map((item) => ({
      item,
      score: (item.width || 0) * (item.height || 0) + (/product|主图|main|gallery|商品/i.test(`${item.alt} ${item.url}`) ? 100000 : 0)
    }))
    .sort((a, b) => b.score - a.score)[0]?.item
  const mainCandidate = existingMain || galleryMain || productCandidate
  if (mainCandidate) {
    result.forEach((item) => {
      if (item === mainCandidate) item.group = 'main'
      else if (item.group === 'gallery' || (item.group !== 'detail' && item.group !== 'other')) item.group = 'auxiliary'
    })
  }
  logs.push(`分类结果：主图 ${result.filter((item) => item.group === 'main').length}，辅图 ${result.filter((item) => item.group === 'auxiliary').length}，详情图 ${result.filter((item) => item.group === 'detail').length}，其他 ${result.filter((item) => item.group === 'other').length}`)
  logs.push(`最终扫描图片: ${result.length} 张`)
  return { items: result, logs }
}

/**
 * 判断 URL 是否为视频文件或流媒体地址
 * @param {string} url
 * @returns {boolean}
 */
function isVideoFileUrl(url) {
  if (!url) return false
  // 支持常见视频扩展名及 HLS 流媒体
  const videoExtensions = /\.(mp4|webm|ogg|mov|avi|mkv|flv|m4v|wmv|3gp|m3u8|m3u)(\?|$)/i
  return videoExtensions.test(url)
}

/**
 * 判断 MIME type 是否为视频或 HLS 流
 * @param {string} mimeType
 * @returns {boolean}
 */
function isVideoMimeType(mimeType) {
  if (!mimeType) return false
  const lower = mimeType.toLowerCase()
  return lower.startsWith('video/') || lower.includes('mpegurl') || lower.includes('m3u8')
}

/**
 * 从 video 元素收集所有可能的视频源 URL
 * @param {HTMLVideoElement} video
 * @returns {string[]}
 */
function collectVideoSources(video) {
  const sources = new Set()

  // 标准属性
  ;[video.currentSrc, video.src, video.getAttribute('src')].filter(Boolean).forEach((s) => sources.add(s))

  // source 子标签：按 src 或 MIME type 识别
  video.querySelectorAll('source').forEach((source) => {
    const sourceSrc = source.src || source.getAttribute('src')
    const sourceType = source.getAttribute('type') || ''
    if (sourceSrc && (isVideoFileUrl(sourceSrc) || isVideoMimeType(sourceType))) {
      sources.add(sourceSrc)
    }
  })

  // 常见懒加载 data-* 属性
  ;['data-src', 'data-url', 'data-video', 'data-source', 'data-original', 'data-video-src', 'data-hls-src'].forEach((attr) => {
    const dataSrc = video.getAttribute(attr)
    if (dataSrc) sources.add(dataSrc)
  })

  return [...sources]
}

/**
 * 扫描页面所有视频
 * 支持 video 标签、iframe 嵌入视频、object/embed、视频链接等
 * @returns {Array}
 */
function scanVideos() {
  const result = []
  const seen = new Set()
  const logs = []

  function addVideo(url, width = 0, height = 0, poster = '', extra = {}) {
    const absoluteUrl = toAbsoluteUrl(url)
    if (!absoluteUrl || absoluteUrl.startsWith('data:')) return false
    if (seen.has(absoluteUrl)) return false
    seen.add(absoluteUrl)
    // 标记是否为 HLS 流媒体
    const isHls = /\.m3u8?(\?|$)/i.test(absoluteUrl)
    result.push({ type: 'video', url: absoluteUrl, poster: poster ? toAbsoluteUrl(poster) : '', width, height, isHls, ...extra })
    return true
  }

  // 无有效 src 时，用 poster 或占位 URL 仍加入列表（需用户交互后才加载的场景）
  function addVideoPlaceholder(video, extra = {}) {
    const poster = video.poster || video.getAttribute('poster') || ''
    const placeholderUrl = poster ? toAbsoluteUrl(poster) : `placeholder://video-${result.length}`
    if (seen.has(placeholderUrl)) return false
    seen.add(placeholderUrl)
    result.push({
      type: 'video',
      url: placeholderUrl,
      poster: poster ? toAbsoluteUrl(poster) : '',
      width: video.videoWidth || video.offsetWidth || 0,
      height: video.videoHeight || video.offsetHeight || 0,
      needsInteraction: true,
      ...extra
    })
    return true
  }

  // 1. 扫描所有 video 标签
  safe(() => {
    const videos = document.querySelectorAll('video')
    logs.push(`video 标签数量: ${videos.length}`)
    let foundCount = 0
    videos.forEach((video) => {
      const poster = video.poster || video.getAttribute('poster') || ''
      const width = video.videoWidth || video.offsetWidth || 0
      const height = video.videoHeight || video.offsetHeight || 0
      const allSources = collectVideoSources(video)
      let added = false

      // 优先添加第一个有效源
      for (const src of allSources) {
        if (addVideo(src, width, height, poster)) {
          foundCount++
          added = true
          break
        }
      }

      // 其余 source 作为备选源追加
      allSources.slice(1).forEach((src) => {
        addVideo(src, width, height, poster, { isSource: true })
      })

      // 无 src 但有 poster 时仍加入列表
      if (!added && poster) {
        if (addVideoPlaceholder(video, { isLazy: true })) foundCount++
      }
    })
    logs.push(`从 video 标签找到: ${foundCount} 个视频`)
  }, '扫描 video 标签')

  // 2. 扫描 iframe 嵌入视频（YouTube、Bilibili 等）
  safe(() => {
    const iframes = document.querySelectorAll('iframe')
    logs.push(`iframe 数量: ${iframes.length}`)
    let embedCount = 0
    iframes.forEach((iframe) => {
      const src = iframe.src || iframe.getAttribute('src')
      if (!src) return
      // 识别常见视频平台（更宽松的匹配）
      const videoPlatforms = [
        /youtube\.com\/embed/,
        /youtu\.be/,
        /youtube-nocookie\.com/,
        /bilibili\.com\/(player|video)/,
        /b23\.tv/,
        /vimeo\.com\/(video|channel)/,
        /dailymotion\.com\/embed/,
        /player\.youku\.com/,
        /v\.qq\.com\/(txp\/iframe|iframe\/player)/,
        /player\.iqiyi\.com/,
        /play\.tudou\.com/,
        /my\.tv\.sohu\.com/,
        /kuaishou\.com\/short-video/,
        /www\.douyin\.com\/player/,
        /player\.bilibili\.com/,
        /w\.soundcloud\.com/,
        /open\.spotify\.com\/embed/
      ]
      const isVideoIframe = videoPlatforms.some(regex => regex.test(src))
      if (isVideoIframe) {
        const width = parseInt(iframe.width) || iframe.offsetWidth || 0
        const height = parseInt(iframe.height) || iframe.offsetHeight || 0
        addVideo(src, width, height, '', { isEmbed: true, platform: getVideoPlatform(src) })
        embedCount++
      }
    })
    logs.push(`从 iframe 找到: ${embedCount} 个嵌入视频`)
  }, '扫描 iframe 视频')

  // 3. 扫描 object/embed 标签（老式视频嵌入方式）
  safe(() => {
    document.querySelectorAll('object, embed').forEach(el => {
      const data = el.data || el.src || el.getAttribute('data') || el.getAttribute('src')
      if (data && (isVideoFileUrl(data) || data.includes('youtube') || data.includes('vimeo'))) {
        addVideo(data, el.width || el.offsetWidth, el.height || el.offsetHeight, '', { isObjectEmbed: true })
      }

      // 检查 param 标签（Flash 视频常用）
      el.querySelectorAll('param[name="movie"], param[name="src"], param[name="url"]').forEach(param => {
        const value = param.value || param.getAttribute('value')
        if (value) {
          addVideo(value, el.width || el.offsetWidth, el.height || el.offsetHeight, '', { isParam: true })
        }
      })
    })
  }, '扫描 object/embed 标签')

  // 4. 扫描带视频扩展名的链接和图片
  safe(() => {
    // 查找所有可能包含视频 URL 的元素
    const allElements = document.querySelectorAll('a[href], img[src], div[data-video], [data-mp4], [data-webm], [data-hls-src], [data-video-src]')
    let linkCount = 0
    allElements.forEach(el => {
      const url = el.href || el.src || el.dataset?.video || el.dataset?.mp4 || el.dataset?.webm || el.dataset?.hlsSrc || el.dataset?.videoSrc || el.getAttribute('href') || el.getAttribute('src')
      if (url && (isVideoFileUrl(url) || url.startsWith('blob:'))) {
        addVideo(url, el.offsetWidth, el.offsetHeight, '', { isLink: true })
        linkCount++
      }
    })
    if (linkCount > 0) logs.push(`从链接/元素找到: ${linkCount} 个视频文件`)
  }, '扫描视频文件链接')

  // 5. 扫描 HTML5 video 懒加载属性（兜底）
  safe(() => {
    document.querySelectorAll('video[data-src], video[data-source], video[data-url], video[data-video-src], video[data-hls-src]').forEach((video) => {
      const src = video.dataset.src || video.dataset.source || video.dataset.url || video.dataset.videoSrc || video.dataset.hlsSrc
      if (src) {
        addVideo(src, video.videoWidth || video.offsetWidth, video.videoHeight || video.offsetHeight, video.poster || '', { isLazy: true })
      }
    })
  }, '扫描懒加载视频（兜底）')

  logs.push(`最终扫描视频: ${result.length} 个`)
  return { items: result, logs }
}

/**
 * 识别视频平台名称
 * @param {string} url
 * @returns {string}
 */
function getVideoPlatform(url) {
  if (!url) return 'unknown'
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'YouTube'
  if (url.includes('bilibili.com') || url.includes('b23.tv')) return 'Bilibili'
  if (url.includes('vimeo.com')) return 'Vimeo'
  if (url.includes('youku.com')) return '优酷'
  if (url.includes('qq.com')) return '腾讯视频'
  if (url.includes('iqiyi.com')) return '爱奇艺'
  if (url.includes('dailymotion.com')) return 'Dailymotion'
  if (url.includes('soundcloud.com')) return 'SoundCloud'
  if (url.includes('spotify.com')) return 'Spotify'
  if (url.includes('douyin.com') || url.includes('kuaishou.com')) return '短视频平台'
  return '其他平台'
}

/**
 * 扫描页面所有媒体资源（图片 + 视频 分离返回）
 * @returns {{images: Array, videos: Array, logs: string[]}}
 */
function scanMedia() {
  // 分别扫描图片和视频，保持独立
  const imageResult = scanImages()
  const videoResult = scanVideos()
  // 合并日志信息
  const allLogs = [...imageResult.logs, ...videoResult.logs]
  allLogs.push(`总计扫描: ${imageResult.items.length} 张图片 + ${videoResult.items.length} 个视频`)
  // 返回分离的数据结构
  return { images: imageResult.items, videos: videoResult.items, logs: allLogs }
}

function detectPlatform() {
  const host = location.hostname.toLowerCase()
  if (host.includes('1688.com')) return '1688'
  if (host.includes('taobao.com')) return 'taobao'
  if (host.includes('tmall.com')) return 'tmall'
  if (host.includes('jd.com')) return 'jd'
  if (host.includes('aliexpress.com')) return 'aliexpress'
  if (host.includes('amazon.')) return 'amazon'
  if (host.includes('ebay.')) return 'ebay'
  if (host.includes('walmart.')) return 'walmart'
  if (host.includes('shopee.')) return 'shopee'
  if (host.includes('lazada.')) return 'lazada'
  if (host.includes('shein.')) return 'shein'
  if (host.includes('temu.')) return 'temu'
  if (host.includes('tiktok.')) return 'tiktok'
  return 'generic'
}

function textFrom(selectors) {
  for (const selector of selectors) {
    const element = document.querySelector(selector)
    const value = element?.getAttribute?.('content') || element?.innerText || element?.textContent
    const cleaned = value?.replace(/\s+/g, ' ').trim()
    if (cleaned) return cleaned
  }
  return ''
}

function jsonLdProducts() {
  const values = []
  document.querySelectorAll('script[type="application/ld+json"]').forEach((node) => {
    try {
      const data = JSON.parse(node.textContent || '{}')
      const list = Array.isArray(data) ? data : [data, ...(data['@graph'] || [])]
      values.push(...list.filter((item) => item && (item['@type'] === 'Product' || item.name)))
    } catch { /* 部分平台的 JSON-LD 不是合法 JSON */ }
  })
  return values
}

function collectStructuredData() {
  const scripts = [...document.querySelectorAll('script:not([src])')]
  const chunks = []
  for (const script of scripts) {
    const value = script.textContent || ''
    if (/sku|商品|product|price|images|规格/i.test(value)) chunks.push(value.slice(0, 200000))
  }
  return chunks.slice(0, 12)
}

function collectJsonMedia() {
  const urls = new Set()
  const urlPattern = /https?:\\?\/\\?\/[^"'\\s\\]+?\\.(?:jpe?g|png|webp|gif)(?:\\?[^"'\\s]*)?/ig
  document.querySelectorAll('script:not([src])').forEach((script) => {
    const matches = script.textContent?.match(urlPattern) || []
    matches.forEach((url) => addIfValid(urls, url.replaceAll('\\/', '/')))
  })
  return [...urls]
}

function findValues(value, keys, result = []) {
  if (!value || result.length > 100) return result
  if (Array.isArray(value)) {
    value.forEach((item) => findValues(item, keys, result))
    return result
  }
  if (typeof value !== 'object') return result
  Object.entries(value).forEach(([key, child]) => {
    if (keys.some((name) => key.toLowerCase() === name.toLowerCase()) && typeof child === 'string' && child.trim()) result.push(child.trim())
    findValues(child, keys, result)
  })
  return result
}

function collectPageStateValues(keys) {
  const values = []
  document.querySelectorAll('script:not([src])').forEach((script) => {
    const raw = script.textContent?.trim() || ''
    if (!raw || raw.length > 1000000) return
    try { findValues(JSON.parse(raw), keys, values) } catch { /* 平台状态脚本通常不是纯 JSON */ }
  })
  return values
}

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function bestText(selectors, options = {}) {
  const candidates = []
  selectors.forEach((selector) => {
    document.querySelectorAll(selector).forEach((element) => {
      const value = cleanText(element.getAttribute?.('content') || element.innerText || element.textContent)
      if (value && value.length >= (options.minLength || 2) && value.length <= (options.maxLength || 240)) candidates.push(value)
    })
  })
  const unique = [...new Set(candidates)]
  return unique.sort((a, b) => {
    const score = (value) => {
      let result = 0
      if (value.length > 8) result += 3
      if (/[\u4e00-\u9fffA-Za-z]/.test(value)) result += 2
      if (/商品|店铺|公司|登录|详情|评价|价格|运费/.test(value)) result -= 4
      return result - Math.abs(80 - value.length) / 100
    }
    return score(b) - score(a)
  })[0] || ''
}

function parseAttributePairs() {
  const attributes = {}
  document.querySelectorAll('table tr').forEach((row) => {
    const cells = [...row.querySelectorAll('th, td')].map((cell) => cleanText(cell.innerText || cell.textContent)).filter(Boolean)
    for (let index = 0; index + 1 < cells.length; index += 2) {
      if (cells[index].length <= 80 && cells[index + 1].length <= 500) attributes[cells[index]] = cells[index + 1]
    }
  })
  document.querySelectorAll('[class*="attribute"] li, [class*="property"] li, [class*="param"] li').forEach((row) => {
    const text = cleanText(row.innerText || row.textContent)
    const parts = text.split(/[:：]/)
    if (parts.length > 1 && parts[0].length <= 80 && parts[1].length <= 500) attributes[parts[0].trim()] = parts.slice(1).join(':').trim()
  })
  return attributes
}

function bodyMatch(pattern) {
  const text = cleanText(document.body?.innerText)
  return text.match(pattern)?.[1] || ''
}

function cleanDetailText(value) {
  return cleanText(value)
    .replace(/【平台活动下价格】[\s\S]*?(?=商品详情|$)/, '')
    .replace(/1688提醒您：[\s\S]*?(?=商品详情|$)/, '')
    .replace(/内容声明：[\s\S]*$/, '')
    .replace(/商品详情\s*/, '')
    .trim()
}

function addIfValid(set, value) {
  const url = toAbsoluteUrl(value?.replaceAll('&amp;', '&'))
  if (url && !url.startsWith('data:')) set.add(url)
}

async function ensureDetailLoaded(platform) {
  const selectors = {
    '1688': '.module-od-product-description',
    amazon: '#aplus_feature_div, #productDescription',
    aliexpress: '#product-description, [class*="product-description"]',
    ebay: '#viTabs_0_is, [class*="item-description"]',
    jd: '#J-detail-content, #detail',
    taobao: '#description, [class*="desc-root"]',
    tmall: '#description, [class*="desc-root"]',
    walmart: '[data-testid*="description"], [class*="description"]',
    shopee: '[class*="product-detail"], [class*="description"], [class*="detail"]',
    lazada: '[data-qa-locator="product-description"], [class*="product-description"], [class*="detail"]',
    shein: '[class*="product-desc"], [class*="description"], [class*="detail"]',
    tiktok: '[data-e2e*="description"], [data-testid*="description"], [class*="description"]',
    temu: '[data-testid*="description"], [class*="description"], [class*="detail"]'
  }
  let target = document.querySelector(selectors[platform] || '[class*="product-description"], [class*="detail-content"]')
  if (!target) {
    const heading = [...document.querySelectorAll('h1, h2, h3, h4')].find((node) => /商品详情|图文详情|product description|about this item/i.test(cleanText(node.innerText || node.textContent)))
    target = heading?.parentElement || null
  }
  if (!target) return
  const originalX = window.scrollX
  const originalY = window.scrollY
  target.scrollIntoView({ block: 'start' })
  await new Promise((resolve) => setTimeout(resolve, 900))
  window.scrollTo(originalX, originalY)
}

async function captureProduct() {
  const platform = detectPlatform()
  await ensureDetailLoaded(platform)
  const classifiedMedia = scanImages().items
  const ld = jsonLdProducts()[0] || {}
  const titleSelectors = platform === 'amazon'
    ? ['#productTitle', '#title', 'h1']
    : platform === 'jd'
      ? ['.sku-name', '.product-intro h1', 'h1']
      : platform === '1688'
        ? ['h1', '[class*="d-title"]', '[class*="offer-title"]', 'meta[property="og:title"]']
        : ['h1', '[class*="title"]', '[class*="Title"]', 'meta[property="og:title"]']
  const descriptionSelectors = platform === 'amazon'
    ? ['#productDescription', '#feature-bullets', '#bookDescription_feature_div']
    : platform === '1688'
      ? ['[class*="detail-content"]', '[class*="detail"]', '[class*="description"]', 'meta[property="og:description"]']
      : ['[class*="detail"]', '[class*="description"]', '[class*="Desc"]', 'meta[property="og:description"]']
  const stateTitles = collectPageStateValues(['title', 'subject', 'productTitle', 'itemTitle', 'offerTitle'])
  const stateDescriptions = collectPageStateValues(['description', 'detail', 'detailDesc', 'itemDesc'])
  const pageTitle = cleanText(document.title).replace(/\s*[-|｜].*$/, '')
  const h1Candidates = [...document.querySelectorAll('h1')].map((node) => cleanText(node.innerText || node.textContent)).filter((value) => value.length > 5)
  const title = platform === '1688'
    ? (h1Candidates.filter((value) => !/公司|店铺|商家/.test(value)).at(-1) || bestText(['[class*="d-title"]', '[class*="offer-title"]'], { minLength: 5, maxLength: 180 }) || pageTitle || ld.name)
    : (textFrom(titleSelectors) || ld.name || stateTitles.find((item) => item.length > 5) || pageTitle)
  const detailText = bestText(descriptionSelectors, { minLength: 20, maxLength: 30000 })
  const description = cleanDetailText(detailText || ld.description || stateDescriptions.find((item) => item.length > 20) || '')
  const detailImages = [...new Set(classifiedMedia.filter((item) => item.group === 'detail').map((item) => item.url))]
  const meta = (name, property) => document.querySelector(`meta[name="${name}"], meta[property="${property}"]`)?.content || ''
  const imageCandidates = [
    ...(Array.isArray(ld.image) ? ld.image : [ld.image]),
    meta('image', 'og:image'),
    ...collectJsonMedia(),
    ...collectPageStateValues(['image', 'imageUrl', 'picUrl', 'mainImage', 'detailImage'])
  ]
  const images = [...new Set([
    ...classifiedMedia.filter((item) => item.type === 'image').map((item) => item.url),
    ...imageCandidates
  ].map((value) => {
    if (!value || typeof value !== 'string' || !(/^(https?:|\/\/|\/)/i.test(value))) return null
    return toAbsoluteUrl(value)
  }).filter(Boolean))]
  const attributes = parseAttributePairs()
  const price = platform === '1688'
    ? bestText(['[class*="price"]', '[class*="Price"]', '[class*="promotion"]'], { minLength: 1, maxLength: 80 })
    : textFrom(['#priceblock_ourprice', '#corePriceDisplay_desktop_feature_div', '[class*="price"]', '[class*="Price"]'])
  const platformFields = {
    sourceTitle: title,
    sourceDescription: description,
    brand: textFrom(['#bylineInfo', '[class*="brand"]', '[class*="Brand"]']) || ld.brand?.name || '',
    price: price || ld.offers?.price || '',
    sku: document.querySelector('[data-sku]')?.getAttribute('data-sku') || textFrom(['[class*="sku"]', '[class*="item-id"]']),
    shop: bestText(['[class*="shop-name"]', '[class*="seller-name"]', 'a[href*="shop"]'], { minLength: 2, maxLength: 120 }),
    moq: bodyMatch(/(\d+件(?:起批|混批))/),
    stock: bodyMatch(/库存\s*(\d+(?:\.\d+)?)/),
    shippingOrigin: bodyMatch(/发货地\s*([^\s]{2,12})/),
    sourceImages: classifiedMedia.map((item) => item.url),
    detailImages,
    supportedFields: platform === 'amazon'
      ? ['title', 'brand', 'bullets', 'description', 'asin', 'variants', 'images', 'videos']
      : platform === '1688'
        ? ['title', 'shop', 'price', 'moq', 'stock', 'shippingOrigin', 'attributes', 'variants', 'images', 'videos', 'detail']
        : ['title', 'description', 'price', 'brand', 'sku', 'attributes', 'variants', 'images', 'videos', 'detail'],
    detailText: description,
    attributes,
    rawStructuredData: collectStructuredData()
  }
  return {
    platform,
    sourceUrl: location.href,
    sourceTitle: title,
    sourceDescription: description,
    normalized: { title, description, brand: platformFields.brand, attributes, variants: [], images, videos: [] },
    platformFields,
    media: classifiedMedia,
    detail: { text: description, images: detailImages },
    capturedAt: new Date().toISOString()
  }
}

/**
 * 监听来自 popup/batch/background 的消息
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'CAPTURE_PRODUCT') {
    captureProduct()
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message || '商品信息采集失败' }))
    return true
  }

  // 扫描页面所有媒体资源（图片和视频分离返回）
  if (message.type === 'SCAN_MEDIA') {
    try {
      // 获取分离后的数据：images 和 videos 独立数组
      const { images, videos, logs } = scanMedia()
      console.log('[图片采集助手] 扫描日志:', logs)
      // 返回分离的数据结构，方便前端分别展示
      sendResponse({ success: true, images, videos, logs })
    } catch (err) {
      const errorMsg = err && err.message ? err.message : String(err)
      console.error('[图片采集助手] 扫描失败:', err)
      sendResponse({ success: false, error: errorMsg, stack: err && err.stack ? err.stack : '' })
    }
  }

  // 兼容旧的扫描图片接口（只返回图片）
  if (message.type === 'SCAN_IMAGES') {
    try {
      const { images, logs } = scanMedia()
      console.log('[图片采集助手] 扫描日志:', logs)
      sendResponse({ success: true, data: images, logs })
    } catch (err) {
      const errorMsg = err && err.message ? err.message : String(err)
      console.error('[图片采集助手] 扫描失败:', err)
      sendResponse({ success: false, error: errorMsg, stack: err && err.stack ? err.stack : '' })
    }
  }

  if (message.type === 'GET_LAST_IMAGE') {
    try {
      const image = findImageAt(lastRightClickPos.x, lastRightClickPos.y)
      console.log('[图片采集助手] 右键图片:', image)
      sendResponse({ success: !!image, data: image })
    } catch (err) {
      const errorMsg = err && err.message ? err.message : String(err)
      console.error('[图片采集助手] 查找右键图片失败:', err)
      sendResponse({ success: false, error: errorMsg })
    }
  }

  // 在源页面读取 blob URL 并转为 data URL（供扩展页下载 blob 视频）
  if (message.type === 'FETCH_BLOB_AS_DATA_URL') {
    const { url } = message
    if (!url || !url.startsWith('blob:')) {
      sendResponse({ success: false, error: '无效的 blob 地址' })
      return true
    }
    fetch(url)
      .then((res) => res.blob())
      .then((blob) => {
        const reader = new FileReader()
        reader.onloadend = () => {
          sendResponse({ success: true, dataUrl: reader.result })
        }
        reader.onerror = () => {
          sendResponse({ success: false, error: 'blob 转 data URL 失败' })
        }
        reader.readAsDataURL(blob)
      })
      .catch((err) => {
        sendResponse({ success: false, error: err.message || 'blob 读取失败' })
      })
    return true
  }

  // 返回 true 保持消息通道开启
  return true
})

} // end __IMAGE_COLLECTOR_CS__ guard
