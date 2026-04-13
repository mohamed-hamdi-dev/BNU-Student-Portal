"""Typed knowledge/assets models for RAG architecture."""

from datetime import datetime, timezone
from sqlalchemy import (
    JSON,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from core.database import Base


class ContentItem(Base):
    __tablename__ = "content_items"

    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String(255), nullable=False)
    college = Column(String(120), nullable=True)
    year = Column(String(40), nullable=True)
    subject = Column(String(255), nullable=True)
    status = Column(String(32), nullable=False, default="active")
    version = Column(Integer, nullable=False, default=1)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))


class KnowledgeDocument(Base):
    __tablename__ = "knowledge_documents"

    id = Column(Integer, primary_key=True, autoincrement=True)
    content_item_id = Column(Integer, ForeignKey("content_items.id"), nullable=False, index=True)
    source_type = Column(String(40), nullable=False, default="text")
    raw_text = Column(Text, nullable=True)
    language = Column(String(12), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))


class KnowledgeChunk(Base):
    __tablename__ = "knowledge_chunks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    content_item_id = Column(Integer, ForeignKey("content_items.id"), nullable=False, index=True)
    knowledge_document_id = Column(Integer, ForeignKey("knowledge_documents.id"), nullable=False, index=True)
    chunk_text = Column(Text, nullable=False)
    chunk_index = Column(Integer, nullable=False, default=0)
    token_count = Column(Integer, nullable=True)
    vector_ref = Column(String(120), nullable=True)
    college = Column(String(120), nullable=True, index=True)
    year = Column(String(40), nullable=True, index=True)
    subject = Column(String(255), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))


class Asset(Base):
    __tablename__ = "assets"

    id = Column(Integer, primary_key=True, autoincrement=True)
    content_item_id = Column(Integer, ForeignKey("content_items.id"), nullable=False, index=True)
    asset_type = Column(String(24), nullable=False)  # pdf|table|link|image
    label = Column(String(255), nullable=True)
    url = Column(String(1024), nullable=True)
    mime_type = Column(String(120), nullable=True)
    display_payload_json = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))


class ChunkAssetMap(Base):
    __tablename__ = "chunk_asset_map"

    id = Column(Integer, primary_key=True, autoincrement=True)
    chunk_id = Column(Integer, ForeignKey("knowledge_chunks.id"), nullable=False, index=True)
    asset_id = Column(Integer, ForeignKey("assets.id"), nullable=False, index=True)
    relation_type = Column(String(40), nullable=False, default="supports_answer")
    weight = Column(Float, nullable=False, default=1.0)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))

