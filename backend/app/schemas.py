# 请求体模型模块（Pydantic Schemas）：
# 定义各接口的入参结构，FastAPI 会自动校验并拒绝格式不合法的请求
# 与 models.py 的区别：models 是数据库表结构，schemas 是 API 请求/响应的形状

from typing import Any
from pydantic import BaseModel, Field


class ProductIn(BaseModel):
    """新增/更新商品的请求体"""
    # 商品 id，可选；不传时由后端自动生成
    id: str | None = None
    # 来源平台标识
    platform: str = "generic"
    # 源商品链接
    source_url: str = ""
    # 源商品标题
    source_title: str = ""
    # 源商品原始数据（任意键值对，抓到什么放什么）
    source_data: dict[str, Any] = Field(default_factory=dict)
    # 清洗后的结构化数据
    normalized_data: dict[str, Any] = Field(default_factory=dict)
    # AI 生成的 listing 内容
    listing_data: dict[str, Any] = Field(default_factory=dict)
    # 媒体资源（图片/视频）
    media: list[dict[str, Any]] = Field(default_factory=list)
    # 商品状态
    status: str = "captured"


class AiRequest(BaseModel):
    """AI 改写接口的请求体"""
    # 动作类型："listing" 表示生成完整 listing，可扩展翻译、优化等动作
    action: str = "listing"
    # 源商品数据（标题、描述、卖点等，是 AI 改写的素材）
    source: dict[str, Any] = Field(default_factory=dict)
    # 当前已有的草稿内容（可选，AI 可在此基础上做局部优化）
    current: dict[str, Any] = Field(default_factory=dict)
    # 目标站点，默认美国站
    marketplace: str = "US"
    # 输出语言，默认美式英语
    language: str = "en-US"


class PublishRequest(BaseModel):
    """发布/校验接口的请求体"""
    # 要发布的商品 id，必填
    product_id: str
    # 要发布的 listing 内容（title / bullets / description 等）
    listing: dict[str, Any] = Field(default_factory=dict)
    # 亚马逊市场 ID，默认北美站（ATVPDKIKX0DER = 美国）
    marketplace_id: str = "ATVPDKIKX0DER"
