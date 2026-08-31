# 通用电商商品采集与 Amazon US 上架助手

## 1. 项目定位

这是一个以 Chrome 开发者模式加载的自用插件，主要用于：

1. 用户手动进入电商平台商品详情页。
2. 插件采集当前页面的商品资料、图片和视频。
3. 用户在工作台中修改图片、规格和文案。
4. 用户按需点击 AI 功能，生成或润色 Amazon 美国站英文 Listing。
5. 保存商品、媒体、文案版本和操作记录。
6. 第一阶段支持导出 Amazon 上架资料，后续通过官方 Amazon SP-API，在人工确认后发布到自己的 Amazon US 店铺。

插件不做登录系统，不做服务端网页爬虫，不绕过验证码、登录限制、反爬机制或 DRM。

## 2. 已确认需求

| 范围 | 要求 |
| --- | --- |
| 使用方式 | Chrome 开发者模式加载已解压插件，不发布 Chrome 应用商店 |
| 采集方式 | 用户自己打开商品详情页，点击“采集当前商品” |
| 目标店铺 | 用户自己的 Amazon 美国站店铺 |
| 支持平台 | 1688、淘宝、天猫、京东、速卖通、Amazon，后续可扩展 TikTok Shop、Temu、Walmart 等 |
| AI | 用户手动点击后才调用模型，不自动修改内容 |
| 媒体 | 保留当前页面抓取所有图片和视频、预览、选择、下载、ZIP 打包能力 |
| 编辑 | 图片、标题、描述、规格、SKU、变体和 Amazon 字段都可以人工修改 |
| 数据 | 使用数据库保存商品、媒体、文案版本、AI 记录和发布记录 |
| 后端 | Python，与前端分离 |
| 发布 | 后续支持人工确认后通过官方 Amazon SP-API 发布 |
| 认证 | 第一阶段不做插件登录和多用户体系 |

## 3. 核心用户流程

```text
打开商品详情页
        |
        v
点击插件“采集当前商品”
        |
        v
识别平台并执行对应解析器
        |
        v
保存原始数据、统一数据、图片和视频记录
        |
        v
进入商品工作台
        |
        +--> 修改标题、描述、规格、SKU 和变体
        +--> 选择、排序、编辑和下载图片/视频
        +--> 按字段手动调用 AI
        |
        v
生成 Amazon US Listing
        |
        v
人工审核和发布前校验
        |
        +--> 导出 Listing 资料
        +--> 后续通过 SP-API 发布到自己的店铺
```

## 4. 平台解析方案

### 4.1 适配器架构

每个平台使用独立适配器。平台特有字段必须保留，不能把不同平台的字段强行合并成一套页面。

```text
PlatformDetector
  ├── 1688Adapter
  ├── TaobaoAdapter
  ├── TmallAdapter
  ├── JDAdapter
  ├── AliExpressAdapter
  ├── AmazonAdapter
  └── GenericAdapter
```

适配器统一实现：

- `canHandle(pageContext)`：判断是否支持当前页面。
- `extractProduct(pageContext)`：提取平台商品数据。
- `extractMedia(pageContext)`：提取图片和视频。
- `extractVariants(pageContext)`：提取 SKU 和变体。
- `getEvidence()`：保存字段来源，便于排查解析错误。

### 4.2 解析优先级

1. 平台页面内的结构化 JSON 数据。
2. JSON-LD、Open Graph、Meta 数据。
3. 平台稳定的 DOM 结构。
4. 通用可见文本和媒体扫描。
5. `GenericAdapter` 作为未知平台兜底。

平台页面经常调整结构，因此每个适配器都需要独立维护、版本化和测试。通用解析器可以保证基础采集，但不能保证未知网站的全部字段都完整。

### 4.3 平台字段

#### 1688

- 商品标题、副标题
- 供应商名称和商品链接
- 价格区间、起批价、起订量
- 商品参数
- 颜色、尺寸和 SKU
- SKU 图片
- 主图、详情图和视频
- 图文详情
- 品牌、材质、包装和供应商信息

#### 淘宝和天猫

- 商品标题
- 店铺、品牌和商品编号
- 价格和促销信息
- 销售属性、颜色、尺寸和 SKU
- 商品参数
- 主图、SKU 图片、详情图和视频
- 图文详情
- 服务、物流和售后信息

#### 京东

- 商品标题、品牌和商品编号
- 价格、促销信息
- 规格参数
- SKU、颜色、尺寸和变体
- 主图、详情图和视频
- 商品介绍
- 物流和售后信息

#### 速卖通

- 英文标题和商品描述
- 价格和变体
- 产品属性
- 颜色、尺寸和 SKU 图片
- 物流信息
- 主图、详情图和视频

#### Amazon

- 标题、品牌和 ASIN
- 五点描述
- 商品详情
- 产品参数和变体
- SKU、价格和页面信息
- 主图、附图、A+ 页面媒体和视频

### 4.4 原始数据与编辑数据

每次采集同时保存三层数据：

```text
平台原始数据
  只读快照，完整保留，不被人工修改覆盖

统一商品数据
  可编辑，用于跨平台整理和转换

Amazon US Listing 数据
  可编辑，用于 Amazon 标题、五点、详情、关键词和属性
```

建议统一商品模型：

```json
{
  "source_platform": "1688",
  "source_url": "https://example.com/item",
  "source_title": "",
  "source_description": "",
  "brand": "",
  "category": "",
  "attributes": {},
  "variants": [],
  "media": [],
  "amazon_listing": {
    "title": "",
    "bullets": [],
    "description": "",
    "search_terms": "",
    "attributes": {}
  },
  "captured_at": ""
}
```

## 5. 图片和视频需求

### 5.1 采集

- 抓取当前页面所有可见图片。
- 识别懒加载图片、`srcset`、`data-src` 和页面 JSON 中的图片。
- 抓取主图、详情图、SKU 图片、营销图和图片缩略图对应的原图。
- 抓取页面视频地址和视频封面。
- 自动去重并记录原始地址、尺寸、格式和哈希值。
- 下载失败显示原因，并支持单个或批量重试。

### 5.2 编辑

- 选择和取消选择。
- 拖拽排序。
- 设置 Amazon 主图。
- 主图、SKU 图、详情图和其他媒体分组。
- 删除、替换和从本地新增媒体。
- 裁剪、旋转、缩放、压缩和格式转换。
- 保留原图，所有处理生成新的编辑版本。
- 后续可扩展抠图、背景移除、加水印和 AI 生成营销图。

### 5.3 本地下载

- 单张图片下载。
- 选中图片批量下载。
- 全部图片下载。
- 视频单独下载。
- 图片和视频 ZIP 打包下载。
- 自定义保存目录或使用浏览器默认下载目录。
- 数据库保存本地文件路径和下载状态。

## 6. 文案编辑和 AI 需求

### 6.1 人工编辑

所有以下字段均可直接修改：

- 来源平台标题和描述副本。
- 统一商品标题和描述。
- 品牌、材质、尺寸、包装清单和产品属性。
- SKU、颜色、尺寸、价格和变体。
- Amazon 英文标题。
- Amazon 五点描述。
- Amazon 商品详情。
- Amazon Search Terms 和关键词。
- 其他 Amazon 类目属性。

原始采集内容只读保存，人工编辑保存到新的草稿版本。

### 6.2 AI 操作

AI 默认不自动执行，必须由用户点击按钮触发：

- 翻译标题。
- 润色标题。
- 生成五点描述。
- 翻译或重写商品详情。
- 生成 Search Terms。
- 提取商品卖点。
- 检查夸大宣传、敏感词和缺失信息。
- 根据 Amazon US 目标市场优化语言。

每次 AI 调用保存：输入内容、模型、提示词版本、输出内容、调用时间和错误信息。

AI 输出只作为建议。用户需要点击“应用到草稿”后才会覆盖当前编辑字段。

### 6.3 Amazon 文案规则

AI 提示词需要引导模型：

- 使用自然的美式英文。
- 避免无事实依据的功效、认证和性能承诺。
- 避免未经授权的品牌词、竞品词和商标词。
- 不编造材质、尺寸、成分、认证、数量和包装内容。
- 遵守 Amazon US 标题、五点和详情字段的长度限制。
- 对不确定的信息标记为待人工确认，而不是自动补全。

## 7. UI 风格和交互规范

### 7.1 设计定位

UI 定位为“专业商品资料工作台”，重点是高密度信息处理、快速扫描和反复编辑，不做营销型首页。

风格关键词：

- 简洁
- 稳定
- 专业
- 高信息密度
- 清晰的状态反馈
- 适合长时间使用

### 7.2 视觉风格

- 以白色、浅灰和深色文字为基础。
- 使用蓝色表示主要操作，绿色表示成功，橙色表示待处理，红色表示错误或风险。
- 不使用大面积渐变、发光效果、装饰性气泡或过度圆角。
- 页面区块使用分隔线、留白和明确层级，不堆叠多层卡片。
- 卡片圆角不超过 8px。
- 标题、状态、字段标签和辅助说明有稳定的字号层级。
- 图片网格使用固定尺寸或稳定的宽高比，避免加载时页面跳动。
- 所有图标按钮提供悬停提示和无障碍标签。

### 7.3 页面结构

#### 插件弹窗

提供高频入口：


- 采集当前商品
- 最近采集记录
- 打开商品工作台
- 批量媒体下载
- 后端连接状态
- 设置

#### 商品工作台

推荐使用三栏布局：

```text
左栏：商品记录和平台原始信息
中栏：统一商品字段和 Amazon Listing 编辑
右栏：媒体管理、AI 操作和校验结果
```

窄屏时改为标签页：

```text
商品信息 | Amazon 文案 | 图片视频 | AI 记录 | 发布校验
```

#### 商品记录页

- 商品列表。
- 来源平台筛选。
- 处理状态筛选。
- 关键词搜索。
- 采集时间筛选。
- Amazon 发布状态筛选。
- 批量导出和批量下载。

#### 设置页

- Python 后端地址。
- 后端连接测试。
- AI 模型和模型参数。
- 媒体保存位置。
- 数据库状态。
- Amazon SP-API 状态和配置入口。

### 7.4 交互要求

- 编辑字段自动保存，并显示保存状态。
- AI 操作显示加载、成功和失败状态。
- AI 结果必须先预览，再应用。
- 删除商品、媒体或版本前需要确认。
- 离开页面前不能丢失未保存内容。
- 发布前显示缺失字段和风险项。
- 关键操作保留操作日志。
- 发布按钮在校验未通过时禁用或明确提示原因。

## 8. 前后端分离架构

项目拆分为两个顶层目录：

```text
project-root/
  frontend/
  backend/
```

### 8.1 前端目录

```text
frontend/
  src/
    background/
      index.js
      download-manager.js
      message-router.js
    content/
      index.js
      media-scanner.js
      product-capture.js
      platform-detector.js
      adapters/
        amazon.js
        aliexpress.js
        1688.js
        taobao.js
        tmall.js
        jd.js
        generic.js
    popup/
      App.vue
      components/
        CaptureActions.vue
        RecentProducts.vue
        ConnectionStatus.vue
    workspace/
      App.vue
      components/
        SourceDataPanel.vue
        ProductEditor.vue
        AmazonListingEditor.vue
        MediaManager.vue
        AiPanel.vue
        ValidationPanel.vue
        PublishPanel.vue
    records/
      ProductList.vue
      ProductDetail.vue
    settings/
      SettingsPage.vue
    api/
      client.js
      products.js
      ai.js
      media.js
      amazon.js
    stores/
      product-store.js
      settings-store.js
    utils/
      storage.js
      export.js
      image-editor.js
      zip.js
  public/
    manifest.json
  package.json
  vite.config.js
```

前端职责：

- 读取当前页面。
- 执行平台适配器。
- 扫描图片和视频。
- 展示和编辑商品资料。
- 调用后端 AI、数据库和 Amazon 接口。
- 处理本地下载和图片编辑。
- 不保存 AI Key、Amazon 密钥或长期授权凭证。

### 8.2 后端目录

```text
backend/
  app/
    main.py
    config.py
    api/
      health.py
      products.py
      media.py
      ai.py
      amazon.py
    models/
      product.py
      source_product.py
      media_asset.py
      content_revision.py
      ai_generation.py
      publish_task.py
    schemas/
      product.py
      media.py
      ai.py
      amazon.py
    services/
      product_service.py
      media_service.py
      ai_service.py
      amazon_service.py
      validation_service.py
    providers/
      ai/
        base.py
        openai_compatible.py
      amazon/
        sp_api_client.py
    db/
      session.py
      migrations/
    security/
      auth.py
      request_signing.py
  tests/
  alembic.ini
  requirements.txt
  .env.example
  README.md
```

后端职责：

- 保存商品和版本记录。
- 保存媒体元数据和下载状态。
- 调用 AI 模型。
- 保存 AI 调用记录。
- 执行 Amazon 字段校验。
- 后续通过官方 SP-API 发布和更新 Listing。
- 保存发布任务和 Amazon 返回结果。

后端不负责抓取用户当前浏览器页面。网页采集由前端扩展完成，因为页面可能需要使用用户当前浏览器会话才能看到完整内容。

## 9. 后端技术选型

- Python 3.11+。
- FastAPI。
- Pydantic，用于请求和响应数据校验。
- SQLAlchemy 2.x。
- Alembic，用于数据库迁移。
- PostgreSQL，正式数据库。
- SQLite，可作为本地开发或单机快速启动选项。
- `httpx`，调用 AI 和 Amazon API。
- Uvicorn，运行 FastAPI。

AI 采用 Provider 抽象层，支持 OpenAI 兼容接口。后续可以切换 OpenAI、DeepSeek、通义千问、Azure 等，不修改前端业务逻辑。

## 10. 数据库核心表

### `products`

商品主记录，包括来源平台、商品名称、处理状态和当前版本。

### `source_products`

保存每个平台的原始页面快照和原始字段 JSON。

### `product_attributes`

保存统一商品属性，例如品牌、材质、尺寸、包装清单等。

### `product_variants`

保存颜色、尺寸、SKU、价格、库存和 SKU 图片关系。

### `media_assets`

保存图片和视频地址、媒体类型、分组、排序、哈希、下载状态、本地路径和编辑版本。

### `content_revisions`

保存标题、描述、五点、关键词等内容的每个版本。

### `ai_generations`

保存 AI 请求、模型、输入、输出、耗时、错误和应用状态。

### `amazon_listings`

保存 Amazon Marketplace、ASIN、Seller SKU、Listing 内容、校验状态和发布状态。

### `publish_tasks`

保存发布请求、任务状态、重试次数、Amazon 返回内容和错误信息。

## 11. 后端 API

### 商品接口

```text
POST   /api/v1/products/capture
GET    /api/v1/products
GET    /api/v1/products/{product_id}
PUT    /api/v1/products/{product_id}
DELETE /api/v1/products/{product_id}
POST   /api/v1/products/{product_id}/duplicate
```

### 版本接口

```text
GET    /api/v1/products/{product_id}/revisions
POST   /api/v1/products/{product_id}/revisions
POST   /api/v1/revisions/{revision_id}/apply
```

### AI 接口

```text
POST /api/v1/ai/translate-title
POST /api/v1/ai/rewrite-title
POST /api/v1/ai/generate-bullets
POST /api/v1/ai/rewrite-description
POST /api/v1/ai/generate-search-terms
POST /api/v1/ai/check-compliance
```

### 媒体接口

```text
POST   /api/v1/products/{product_id}/media
PUT    /api/v1/media/{media_id}
DELETE /api/v1/media/{media_id}
POST   /api/v1/media/{media_id}/download
POST   /api/v1/products/{product_id}/media/download-zip
```

### Amazon 接口

```text
POST /api/v1/amazon/listings/validate
POST /api/v1/amazon/listings/preview
POST /api/v1/amazon/listings/publish
GET  /api/v1/amazon/publish-tasks/{task_id}
POST /api/v1/amazon/listings/{listing_id}/update
```

第一阶段 Amazon 发布接口可以先完成字段校验、草稿和预览；SP-API 凭证配置完成后再启用真实发布。

## 12. 一键上链接

支持两个层级：

### 一键生成上架资料

- 将来源商品转换为 Amazon US 字段。
- 使用用户已经确认的图片和文案。
- 执行标题、五点、详情和图片校验。
- 生成 Amazon Listing 草稿。
- 导出 CSV、JSON、图片 ZIP 和资料包。

### 确认并发布

- 用户手动点击确认。
- 后端再次校验必填字段。
- 通过官方 Amazon SP-API 创建或更新 Listing。
- 保存发布任务、请求结果和错误原因。
- 支持失败重试和修改后重新发布。

不使用 Seller Central 网页模拟点击，不自动绕过验证码或风控。开发者模式插件和公网 IP 本身不是封店原因；店铺风险主要取决于商品合规、知识产权、Listing 真实性、发布频率和 Amazon API 使用规范。

## 13. 安全设计

- AI API Key 只保存于后端 `.env`。
- Amazon LWA、AWS IAM 和 SP-API 凭证只保存于后端安全配置。
- 前端只保存后端地址和短期访问令牌。
- 公网部署必须增加访问令牌、请求签名、IP 白名单或 Tailscale 私网。
- 不把数据库端口直接暴露到公网。
- 生产环境建议使用 HTTPS；没有域名时可以先运行采集、数据库和 AI，接入 Amazon 授权时再根据 SP-API 配置要求补充 HTTPS 和回调地址。
- 所有发布操作保存审计记录。
- 对 AI 和发布接口增加请求频率限制。

## 14. 非功能需求

- 采集失败时必须显示具体原因，而不是静默失败。
- 平台解析器互相隔离，单个平台改版不能影响其他平台。
- 所有接口返回统一错误格式。
- 大量图片加载时不能造成 UI 页面明显跳动。
- 图片下载支持断点状态、重试和去重。
- 商品编辑内容自动保存。
- 数据库迁移可重复执行，不能依赖手工改表。
- 前端和后端可以独立启动、构建和部署。
- 关键解析器、AI 接口、数据库服务和 Amazon 校验必须有自动化测试。

## 15. 实施阶段

### 阶段一：扩展重构和采集

- 清理旧 OAuth、登录和素材库上传功能。
- 保留当前页面全部图片、视频抓取和本地 ZIP 下载。
- 建立平台识别和适配器框架。
- 实现 1688、淘宝、天猫、京东、速卖通、Amazon 和通用解析器。
- 建立原始数据、统一数据和 Amazon 数据模型。

### 阶段二：数据库和工作台

- 创建 Python FastAPI 后端。
- 接入 PostgreSQL。
- 实现商品、媒体、版本和操作记录。
- 重做商品工作台。
- 支持图片和文案人工修改。

### 阶段三：AI 文案

- 接入可配置的 AI Provider。
- 实现按字段手动润色。
- 保存 AI 版本和人工应用记录。
- 增加 Amazon US 文案校验。
- 增加 CSV、JSON 和 ZIP 导出。

### 阶段四：Amazon 发布

- 配置 Amazon SP-API 自授权。
- 获取类目 Product Type 和必填属性。
- 实现发布前校验。
- 实现人工确认后的创建、更新和失败重试。
- 记录 Amazon 返回结果。

### 阶段五：平台扩展

- 增加 TikTok Shop、Temu、Walmart 等适配器。
- 根据不同目标平台建立独立发布字段。
- 支持多平台资料转换和发布。

## 16. 当前需要确认的开发参数

正式实施前还需要确定：

1. AI 使用 OpenAI、DeepSeek、通义千问，还是已有的 OpenAI 兼容接口？
2. 服务器是 Windows 还是 Linux？
3. 图片编辑第一版是否需要背景移除、抠图和加水印，还是先实现裁剪、缩放、压缩、排序、替换？
4. Amazon 是否已经有 Professional Seller 账号，以及是否准备申请 SP-API 自授权？

