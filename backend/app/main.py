# 后端主入口：FastAPI 应用 + 所有 API 路由
# 模块职责：
#   1. 应用生命周期管理（启动时自动建表，关闭时释放数据库连接）
#   2. CORS 跨域配置（允许前端本地/线上域名访问）
#   3. 提供商品管理、AI Listing 改写、亚马逊发布三大类接口

from contextlib import asynccontextmanager
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import uuid4
import httpx

from .config import settings          # 全局配置（读取 .env 环境变量）
from .db import Base, engine, get_session   # 数据库引擎、ORM 基类、会话依赖
from .models import AiGeneration, Product, PublishTask   # 三张数据表模型
from .schemas import AiRequest, ProductIn, PublishRequest  # 请求体校验模型


# ============ 应用生命周期 ============
# lifespan：FastAPI 推荐的启动/关闭钩子写法
# 启动时：自动根据 ORM 模型创建所有数据表（已存在的表不会重复创建）
# 关闭时：释放数据库连接池，避免连接泄漏
@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as connection:
        # create_all 会对比模型定义与现有表结构，缺失的表会自动补建
        await connection.run_sync(Base.metadata.create_all)
    yield
    await engine.dispose()


# ============ 创建 FastAPI 实例并配置 CORS ============
app = FastAPI(title=settings.app_name, version="0.1.0", lifespan=lifespan)

# 前端来源地址从环境变量读取，逗号分隔，例如 "http://localhost:5173,http://localhost:3000"
origins = [item.strip() for item in settings.frontend_origins.split(",")]
# 允许跨域携带凭证（Cookie 等），并放开所有请求方法与请求头
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])


# ============ 健康检查接口 ============
# 用途：前端/运维探活，同时返回 AI 是否已配置（未配置时 AI 接口会走降级逻辑）
@app.get("/health")
async def health():
    return {"status": "ok", "ai_configured": bool(settings.ai_api_key and settings.ai_model)}


# ============ 商品管理接口 ============

# 新增商品：把采集到的商品数据入库
# 入参 ProductIn 由 Pydantic 自动校验；session 由 Depends 注入（请求结束自动关闭）
@app.post("/api/v1/products")
async def create_product(payload: ProductIn, session: AsyncSession = Depends(get_session)):
    # 前端没传 id 时自动生成一个 32 位随机 id（uuid4 去横线）
    product = Product(id=payload.id or uuid4().hex, **payload.model_dump(exclude={"id"}))
    session.add(product)
    await session.commit()
    return {"id": product.id, "status": product.status}


# 商品列表：按最后更新时间倒序，返回列表页所需的精简字段
@app.get("/api/v1/products")
async def list_products(session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(Product).order_by(Product.updated_at.desc()))
    return [{"id": item.id, "platform": item.platform, "source_title": item.source_title, "status": item.status, "updated_at": item.updated_at} for item in result.scalars()]


# 商品详情：返回单个商品的全部字段（含源数据、AI 生成的 listing 等）
@app.get("/api/v1/products/{product_id}")
async def get_product(product_id: str, session: AsyncSession = Depends(get_session)):
    product = await session.get(Product, product_id)
    if not product:
        # 商品不存在时返回 404
        raise HTTPException(404, "商品不存在")
    return product.__dict__


# 更新商品：只更新前端本次实际传了的字段（exclude_unset）
@app.put("/api/v1/products/{product_id}")
async def update_product(product_id: str, payload: ProductIn, session: AsyncSession = Depends(get_session)):
    product = await session.get(Product, product_id)
    if not product:
        raise HTTPException(404, "商品不存在")
    # 遍历请求体中已设置的字段，逐个覆盖到 ORM 对象上
    for key, value in payload.model_dump(exclude={"id"}, exclude_unset=True).items():
        setattr(product, key, value)
    await session.commit()
    return {"id": product.id, "status": product.status}


# ============ AI 改写接口 ============

# 降级兜底：未配置 AI 密钥时，直接用原文拼一份"草稿 listing"返回
# 五条 Bullet Points 是亚马逊规范要求，不足的用空字符串占位
def fallback_listing(request: AiRequest) -> dict:
    source = request.source
    title = source.get("title", "")
    description = source.get("description", "")
    return {"title": title, "bullets": [description[:180]] + ["" for _ in range(4)], "description": description, "searchTerms": ""}


# AI Listing 改写：把源商品信息交给大模型，生成符合美国站规范的英文 listing
@app.post("/api/v1/ai/rewrite")
async def rewrite(request: AiRequest, session: AsyncSession = Depends(get_session)):
    # 未配置 AI 密钥/模型时走降级逻辑，不让接口直接报错，方便前端先跑通流程
    if not settings.ai_api_key or not settings.ai_model:
        return {"result": fallback_listing(request), "mode": "fallback", "message": "未配置 AI_API_KEY 或 AI_MODEL，已返回原文草稿"}
    # 系统提示词：约束 AI 只做改写、不编造事实，且只返回 JSON
    system = "You are an Amazon US listing editor. Return JSON only with title, bullets (five strings), description, searchTerms. Never invent product facts, certifications, materials, sizes, or claims. Use natural US English."
    user = request.model_dump_json()
    try:
        # 调用 OpenAI 兼容接口（可替换为任意兼容网关，如 DeepSeek、通义等）
        async with httpx.AsyncClient(timeout=90) as client:
            response = await client.post(f"{settings.ai_base_url.rstrip('/')}/chat/completions", headers={"Authorization": f"Bearer {settings.ai_api_key}"}, json={"model": settings.ai_model, "temperature": 0.4, "response_format": {"type": "json_object"}, "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]})
            response.raise_for_status()
            # 从响应中取出模型返回的 JSON 文本并解析成字典
            content = response.json()["choices"][0]["message"]["content"]
            import json
            result = json.loads(content)
    except Exception as exc:
        # AI 调用失败统一返回 502，并把原始错误信息透给前端便于排查
        raise HTTPException(502, f"AI 服务调用失败：{exc}") from exc
    # 把每次 AI 生成结果落库，便于审计与效果回溯
    generation = AiGeneration(id=uuid4().hex, product_id=request.source.get("id", "unsaved"), action=request.action, request_data=request.model_dump(), result_data=result, model=settings.ai_model)
    session.add(generation)
    await session.commit()
    return {"result": result, "mode": "ai", "model": settings.ai_model}


# ============ 亚马逊发布接口 ============

# 发布前校验：检查 listing 是否满足亚马逊基本要求（标题、五点、详情必填）
@app.post("/api/v1/amazon/listings/validate")
async def validate_listing(request: PublishRequest):
    listing = request.listing
    errors = []
    # 逐项校验，缺什么就记录什么错误信息
    if not listing.get("title"): errors.append("缺少标题")
    if len(listing.get("bullets", [])) < 5: errors.append("需要五条 Bullet Points")
    if not listing.get("description"): errors.append("缺少商品详情")
    return {"valid": not errors, "errors": errors, "marketplace_id": request.marketplace_id}


# 发布到亚马逊：当前为"草稿模式"，仅保存发布任务，不真实调用 SP-API
# 后续配置好 SP-API（凭据、授权、Listing 接口）后，再替换为真实发布逻辑
@app.post("/api/v1/amazon/listings/publish")
async def publish_listing(request: PublishRequest, session: AsyncSession = Depends(get_session)):
    # status 为 pending_review：表示已保存待审核，符合"先存草稿再发布"的流程
    task = PublishTask(id=uuid4().hex, product_id=request.product_id, status="pending_review", request_data=request.model_dump(), response_data={"message": "SP-API 尚未配置，已保存发布任务草稿"})
    session.add(task)
    await session.commit()
    return {"task_id": task.id, "status": task.status, "message": "请配置 Amazon SP-API 后启用真实发布"}
