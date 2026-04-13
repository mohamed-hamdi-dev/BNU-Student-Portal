"""Conversation and Message Pydantic schemas."""

from datetime import datetime
from pydantic import BaseModel, Field


# ── Messages ──────────────────────────────────────────────────────────
class MessageBase(BaseModel):
    text: str


class MessageCreate(MessageBase):
    pass  # sender_type and sender_user_id are inferred from token


class MessageResponse(MessageBase):
    id: str
    conversation_id: str
    sender_type: str
    sender_user_id: int | None = None
    sender_name: str | None = None
    is_read: bool
    created_at: datetime

    class Config:
        from_attributes = True


# ── Conversations ─────────────────────────────────────────────────────
class ConversationBase(BaseModel):
    type: str = "support"


class ConversationCreate(ConversationBase):
    pass


class ConversationResponse(ConversationBase):
    id: str
    student_id: int
    assigned_admin_id: int | None = None
    status: str
    is_student_online: bool
    student_last_seen: datetime | None = None
    unread_for_admin: int
    unread_for_student: int
    last_message_text: str | None = None
    last_message_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    
    # Optional fields for frontend convenience
    student_name: str | None = None
    student_username: str | None = None

    class Config:
        from_attributes = True
