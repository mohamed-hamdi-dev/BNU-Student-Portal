"""
OTP Request ORM model.

Stores hashed OTPs with expiry, attempt tracking, and usage state.
Raw OTP is NEVER stored — only the salted hash.
"""

from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String
from core.database import Base


class OTPRequest(Base):
    __tablename__ = "otp_requests"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    otp_hash = Column(String(255), nullable=False)
    purpose = Column(String(20), nullable=False, default="password_reset")
    attempts = Column(Integer, nullable=False, default=0)
    is_used = Column(Boolean, nullable=False, default=False)
    expires_at = Column(DateTime(timezone=True), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
