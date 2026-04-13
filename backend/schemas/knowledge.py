"""Schemas for typed knowledge/assets ingestion."""

from datetime import datetime
from typing import Any, List, Optional
from pydantic import BaseModel, Field


class AssetIn(BaseModel):
    asset_type: str = Field(..., description="pdf|table|link|image")
    label: Optional[str] = None
    url: Optional[str] = None
    mime_type: Optional[str] = None
    display_payload: Optional[Any] = None


class KnowledgeIngestRequest(BaseModel):
    title: str
    college: Optional[str] = None
    year: Optional[str] = None
    subject: Optional[str] = None
    source_type: str = "text"
    knowledge_texts: List[str] = Field(default_factory=list)
    assets: List[AssetIn] = Field(default_factory=list)


class KnowledgeIngestResponse(BaseModel):
    content_item_id: int
    knowledge_document_id: int
    chunks_indexed: int
    assets_created: int
    created_at: datetime


class AssetOut(BaseModel):
    id: int
    asset_type: str
    label: Optional[str] = None
    url: Optional[str] = None
    mime_type: Optional[str] = None
    display_payload: Optional[Any] = None


class ContentAssetsResponse(BaseModel):
    content_item_id: int
    title: str
    assets: List[AssetOut]

