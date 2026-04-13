"""
User contact preferences for self-service profile editing.

This keeps university identity data in `users` unchanged, while allowing
students to configure:
- display_name (shown in UI headers)
- recovery_email (used for OTP password reset)
- phone_number
"""

from datetime import datetime, timezone
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String
from core.database import Base


class UserContactSettings(Base):
    __tablename__ = "user_contact_settings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)
    display_name = Column(String(255), nullable=True)
    recovery_email = Column(String(255), nullable=True)
    phone_number = Column(String(40), nullable=True)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
