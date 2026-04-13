"""Conversation rating ORM model for post-chat service evaluation."""

from datetime import datetime, timezone
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from core.database import Base


class ConversationRating(Base):
    __tablename__ = "conversation_ratings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    conversation_id = Column(String(64), ForeignKey("conversations.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)
    student_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    score = Column(Integer, nullable=False)  # 1..5
    comment = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
