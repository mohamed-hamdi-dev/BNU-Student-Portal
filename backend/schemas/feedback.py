"""Feedback Pydantic schemas."""

from datetime import datetime
from pydantic import BaseModel, Field


class FeedbackBase(BaseModel):
    message: str


class FeedbackCreate(FeedbackBase):
    pass


class FeedbackResponse(FeedbackBase):
    id: int
    user_id: int | None = None
    user_name: str | None = None
    level: str | None = None
    status: str
    is_read: bool
    created_at: datetime

    class Config:
        from_attributes = True
