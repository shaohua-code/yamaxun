from contextlib import asynccontextmanager
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import uuid4
import httpx

from .config import settings
from .db import Base, engine, get_session
from .models import AiGeneration, Product, PublishTask
from .schemas import AiRequest, ProductIn, PublishRequest


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    yield
    await engine.dispose()


app = FastAPI(title=settings.app_name, version="0.1.0", lifespan=lifespan)
origins = [item.strip() for item in settings.frontend_origins.split(",")]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])


@app.get("/health")
async def health():
    return {"status": "ok", "ai_configured": bool(settings.ai_api_key and settings.ai_model)}


@app.post("/api/v1/products")
async def create_product(payload: ProductIn, session: AsyncSession = Depends(get_session)):
    product = Product(id=payload.id or uuid4().hex, **payload.model_dump(exclude={"id"}))
    session.add(product)
    await session.commit()
    return {"id": product.id, "status": product.status}


@app.get("/api/v1/products")
async def list_products(session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(Product).order_by(Product.updated_at.desc()))
    return [{"id": item.id, "platform": item.platform, "source_title": item.source_title, "status": item.status, "updated_at": item.updated_at} for item in result.scalars()]


@app.get("/api/v1/products/{product_id}")
async def get_product(product_id: str, session: AsyncSession = Depends(get_session)):
    product = await session.get(Product, product_id)
    if not product:
        raise HTTPException(404, "商品不存在")
    return product.__dict__


@app.put("/api/v1/products/{product_id}")
async def update_product(product_id: str, payload: ProductIn, session: AsyncSession = Depends(get_session)):
    product = await session.get(Product, product_id)
    if not product:
        raise HTTPException(404, "商品不存在")
    for key, value in payload.model_dump(exclude={"id"}, exclude_unset=True).items():
        setattr(product, key, value)
    await session.commit()
    return {"id": product.id, "status": product.status}


def fallback_listing(request: AiRequest) -> dict:
    source = request.source
    title = source.get("title", "")
    description = source.get("description", "")
    return {"title": title, "bullets": [description[:180]] + ["" for _ in range(4)], "description": description, "searchTerms": ""}


@app.post("/api/v1/ai/rewrite")
async def rewrite(request: AiRequest, session: AsyncSession = Depends(get_session)):
    if not settings.ai_api_key or not settings.ai_model:
        return {"result": fallback_listing(request), "mode": "fallback", "message": "未配置 AI_API_KEY 或 AI_MODEL，已返回原文草稿"}
    system = "You are an Amazon US listing editor. Return JSON only with title, bullets (five strings), description, searchTerms. Never invent product facts, certifications, materials, sizes, or claims. Use natural US English."
    user = request.model_dump_json()
    try:
        async with httpx.AsyncClient(timeout=90) as client:
            response = await client.post(f"{settings.ai_base_url.rstrip('/')}/chat/completions", headers={"Authorization": f"Bearer {settings.ai_api_key}"}, json={"model": settings.ai_model, "temperature": 0.4, "response_format": {"type": "json_object"}, "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]})
            response.raise_for_status()
            content = response.json()["choices"][0]["message"]["content"]
            import json
            result = json.loads(content)
    except Exception as exc:
        raise HTTPException(502, f"AI 服务调用失败：{exc}") from exc
    generation = AiGeneration(id=uuid4().hex, product_id=request.source.get("id", "unsaved"), action=request.action, request_data=request.model_dump(), result_data=result, model=settings.ai_model)
    session.add(generation)
    await session.commit()
    return {"result": result, "mode": "ai", "model": settings.ai_model}


@app.post("/api/v1/amazon/listings/validate")
async def validate_listing(request: PublishRequest):
    listing = request.listing
    errors = []
    if not listing.get("title"): errors.append("缺少标题")
    if len(listing.get("bullets", [])) < 5: errors.append("需要五条 Bullet Points")
    if not listing.get("description"): errors.append("缺少商品详情")
    return {"valid": not errors, "errors": errors, "marketplace_id": request.marketplace_id}


@app.post("/api/v1/amazon/listings/publish")
async def publish_listing(request: PublishRequest, session: AsyncSession = Depends(get_session)):
    task = PublishTask(id=uuid4().hex, product_id=request.product_id, status="pending_review", request_data=request.model_dump(), response_data={"message": "SP-API 尚未配置，已保存发布任务草稿"})
    session.add(task)
    await session.commit()
    return {"task_id": task.id, "status": task.status, "message": "请配置 Amazon SP-API 后启用真实发布"}

