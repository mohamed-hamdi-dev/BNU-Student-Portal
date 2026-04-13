"""
Conversation and Message ORM models for live support chat.

Key design:
  - sender_type is an enum: student | admin | assistant | system
  - assistant ≠ admin — chatbot messages are clearly distinguished
  - sender_user_id is nullable (system/assistant messages have no human sender)
"""

from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from core.database import Base


class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(String(64), primary_key=True)
    student_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    assigned_admin_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)

    # Status: "active", "closed"
    status = Column(String(20), nullable=False, default="active", index=True)
    # Type: "support", "general"
    type = Column(String(20), nullable=False, default="support")

    # Student presence tracking
    is_student_online = Column(Boolean, nullable=False, default=False)
    student_last_seen = Column(DateTime(timezone=True), nullable=True)

    # Unread counters (denormalized for performance)
    unread_for_admin = Column(Integer, nullable=False, default=0)
    unread_for_student = Column(Integer, nullable=False, default=0)

    # Last message cache (denormalized for listing)
    last_message_text = Column(Text, nullable=True)
    last_message_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))


class Message(Base):
    __tablename__ = "messages"

    id = Column(String(64), primary_key=True)
    conversation_id = Column(String(64), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True)

    # ── sender_type enum (enforced at app layer for SQLite compatibility) ──
    # Valid values: "student", "admin", "assistant", "system"
    # CRITICAL: "assistant" ≠ "admin" — chatbot is NOT a human admin
    sender_type = Column(String(20), nullable=False)

    # Nullable — system/assistant messages don't have a human sender
    sender_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    sender_name = Column(String(255), nullable=True)

    text = Column(Text, nullable=False)
    is_read = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), index=True)


# Valid sender types — enforced in the service/router layer
VALID_SENDER_TYPES = {"student", "admin", "assistant", "system"}
