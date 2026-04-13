"""Storage Pydantic schemas."""

from datetime import datetime
from pydantic import BaseModel, Field


class StorageBase(BaseModel):
    file_name: str = Field(..., max_length=255)
    level: str | None = None
    category: str | None = Field(None, max_length=100)
    is_favorite: bool = False
    is_indexed: bool = False


class StorageCreate(StorageBase):
    pass


class StorageUpdate(BaseModel):
    file_name: str | None = Field(None, max_length=255)
    level: str | None = None
    category: str | None = Field(None, max_length=100)
    is_favorite: bool | None = None
    is_indexed: bool | None = None


class StorageResponse(StorageBase):
    id: int
    owner_id: int | None = None
    stored_name: str | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
