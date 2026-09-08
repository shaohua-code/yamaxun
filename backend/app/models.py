# 数据表模型模块（ORM）：定义数据库中的三张表
#   1. Product      —— 商品主表（采集源数据 + AI 生成的 listing）
#   2. AiGeneration —— AI 生成历史记录表（每次 AI 调用的请求与结果）
#   3. PublishTask  —— 亚马逊发布任务表（草稿/待审核/已发布）
# 注意：表结构变更后，启动时 create_all 只会新建缺失的表，不会修改已有表
# 如需修改字段，删除 commerce.db 后重启即可重建（本地开发常用做法）

from datetime import datetime, timezone
from sqlalchemy import DateTime, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column
from .db import Base


# 统一的当前时间函数：使用 UTC 时区，避免服务器时区不一致导致时间错乱
def now():
    return datetime.now(timezone.utc)


class Product(Base):
    """商品表：一个从源平台采集的商品对应一条记录"""
    __tablename__ = "products"
    # 主键：32 位随机字符串（uuid4().hex），由后端生成或前端指定
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    # 来源平台标识，例如 "amazon" / "taobao"，默认 generic 表示通用
    platform: Mapped[str] = mapped_column(String(32), default="generic")
    # 源商品链接（采集时的原始 URL）
    source_url: Mapped[str] = mapped_column(Text, default="")
    # 源商品标题（列表页展示用）
    source_title: Mapped[str] = mapped_column(Text, default="")
    # 源商品完整原始数据（标题、价格、类目等抓取到的所有字段）
    source_data: Mapped[dict] = mapped_column(JSON, default=dict)
    # 结构化清洗后的数据（统一字段格式后的中间层）
    normalized_data: Mapped[dict] = mapped_column(JSON, default=dict)
    # AI 生成的最终 listing 数据（title / bullets / description / searchTerms）
    listing_data: Mapped[dict] = mapped_column(JSON, default=dict)
    # 媒体资源列表（图片、视频等 URL 数组）
    media: Mapped[list] = mapped_column(JSON, default=list)
    # 商品状态流转：captured（已采集）→ rewritten（已改写）→ published（已发布）等
    status: Mapped[str] = mapped_column(String(32), default="captured")
    # 创建时间与更新时间（updated_at 在行数据变化时自动刷新）
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)


class AiGeneration(Base):
    """AI 生成记录表：保存每次 AI 改写的输入输出，便于审计与效果对比"""
    __tablename__ = "ai_generations"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    # 关联的商品 id（建索引加快按商品查询历史的速度）
    product_id: Mapped[str] = mapped_column(String(64), index=True)
    # 触发的动作类型，例如 "listing"（生成完整 listing）
    action: Mapped[str] = mapped_column(String(32))
    # 本次 AI 请求的完整入参（源商品数据 + 当前草稿等）
    request_data: Mapped[dict] = mapped_column(JSON, default=dict)
    # 本次 AI 返回的结果（生成的 listing JSON）
    result_data: Mapped[dict] = mapped_column(JSON, default=dict)
    # 使用的模型名称，方便回溯不同模型的效果差异
    model: Mapped[str] = mapped_column(String(128), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class PublishTask(Base):
    """发布任务表：记录每次向亚马逊发布的任务及结果"""
    __tablename__ = "publish_tasks"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    # 关联的商品 id（建索引加快查询）
    product_id: Mapped[str] = mapped_column(String(64), index=True)
    # 任务状态：draft（草稿）→ pending_review（待审核）→ published（已发布）
    status: Mapped[str] = mapped_column(String(32), default="draft")
    # 发布请求的完整入参（listing 内容 + 目标站点等）
    request_data: Mapped[dict] = mapped_column(JSON, default=dict)
    # 发布响应（SP-API 返回结果或提示信息）
    response_data: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
