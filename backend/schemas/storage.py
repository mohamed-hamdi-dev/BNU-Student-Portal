"""Storage Pydantic schemas."""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class StorageBase(BaseModel):
    file_name: str = Field(..., max_length=255)
    level: str | None = Field(None, max_length=255)
    category: str | None = Field(None, max_length=100)
    is_favorite: bool = False
    is_indexed: bool = False
    # Extended metadata
    college: str | None = Field(None, max_length=200)
    program: str | None = Field(None, max_length=200)
    academic_year: str | None = Field(None, max_length=40)
    semester: str | None = Field(None, max_length=40)
    keywords: str | None = Field(None, max_length=500)
    priority: int | None = 0
    source_type: str | None = Field(None, max_length=40)
    content_type: str | None = Field(None, max_length=100)


class StorageCreate(StorageBase):
    pass


class StorageUpdate(BaseModel):
    file_name: str | None = Field(None, max_length=255)
    level: str | None = Field(None, max_length=255)
    category: str | None = Field(None, max_length=100)
    is_favorite: bool | None = None
    is_indexed: bool | None = None
    college: str | None = Field(None, max_length=200)
    program: str | None = Field(None, max_length=200)
    academic_year: str | None = Field(None, max_length=40)
    semester: str | None = Field(None, max_length=40)
    keywords: str | None = Field(None, max_length=500)
    priority: int | None = None
    source_type: str | None = Field(None, max_length=40)
    content_type: str | None = Field(None, max_length=100)


class StorageResponse(StorageBase):
    id: int
    owner_id: int | None = None
    stored_name: str | None = None
    extracted_text: str | None = None
    chunks_count: int | None = 0
    indexing_status: str | None = "pending"
    indexing_error: str | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
