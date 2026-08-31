from typing import Any
from pydantic import BaseModel, Field


class ProductIn(BaseModel):
    id: str | None = None
    platform: str = "generic"
    source_url: str = ""
    source_title: str = ""
    source_data: dict[str, Any] = Field(default_factory=dict)
    normalized_data: dict[str, Any] = Field(default_factory=dict)
    listing_data: dict[str, Any] = Field(default_factory=dict)
    media: list[dict[str, Any]] = Field(default_factory=list)
    status: str = "captured"


class AiRequest(BaseModel):
    action: str = "listing"
    source: dict[str, Any] = Field(default_factory=dict)
    current: dict[str, Any] = Field(default_factory=dict)
    marketplace: str = "US"
    language: str = "en-US"


class PublishRequest(BaseModel):
    product_id: str
    listing: dict[str, Any] = Field(default_factory=dict)
    marketplace_id: str = "ATVPDKIKX0DER"
