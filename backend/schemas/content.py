"""Content Pydantic schemas."""

from datetime import datetime
from pydantic import BaseModel, Field


class ContentBase(BaseModel):
    target_level: str | None = Field(None, max_length=255)
    subject: str = Field(..., max_length=255)
    category: str | None = Field(None, max_length=100)
    body: str | None = None
    content_type: str | None = Field(None, max_length=32)
    tags: str | None = None
    college: str | None = Field(None, max_length=255)
    level: str | None = Field(None, max_length=64)
    program: str | None = Field(None, max_length=128)
    file_url: str | None = Field(None, max_length=1024)
    academic_year: str | None = Field(None, max_length=32)
    semester: str | None = Field(None, max_length=64)
    display_priority: int | None = Field(0, ge=0)


class ContentCreate(ContentBase):
    pass


class ContentUpdate(BaseModel):
    target_level: str | None = Field(None, max_length=255)
    subject: str | None = Field(None, max_length=255)
    category: str | None = Field(None, max_length=100)
    body: str | None = None
    content_type: str | None = Field(None, max_length=32)
    tags: str | None = None
    college: str | None = Field(None, max_length=255)
    level: str | None = Field(None, max_length=64)
    program: str | None = Field(None, max_length=128)
    file_url: str | None = Field(None, max_length=1024)
    academic_year: str | None = Field(None, max_length=32)
    semester: str | None = Field(None, max_length=64)
    display_priority: int | None = Field(None, ge=0)


class ContentResponse(ContentBase):
    id: int
    author_id: int
    created_at: datetime

    class Config:
        from_attributes = True
