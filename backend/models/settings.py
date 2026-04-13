"""
Admin Settings ORM model.

IMPORTANT: This stores PREFERENCES only (notifications, theme, etc.)
Admin IDENTITY (name, email) comes from the User model / AuthContext.
"""

from datetime import datetime, timezone
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer
from core.database import Base


class AdminSettings(Base):
    __tablename__ = "admin_settings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    admin_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)

    # Notification preferences
    notify_live_chat = Column(Boolean, nullable=False, default=True)
    notify_summary = Column(Boolean, nullable=False, default=False)
    notify_feedback = Column(Boolean, nullable=False, default=False)

    updated_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
