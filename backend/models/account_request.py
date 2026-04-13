from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Integer, String, Text

from core.database import Base


class AccountRequest(Base):
    __tablename__ = "account_requests"

    id = Column(Integer, primary_key=True, autoincrement=True)
    full_name = Column(String(255), nullable=False)
    national_id = Column(String(50), nullable=False, index=True)
    college = Column(String(100), nullable=False)
    level = Column(String(50), nullable=False)
    email = Column(String(255), nullable=False, index=True)

    # pending | approved | rejected
    status = Column(String(20), nullable=False, default="pending", index=True)
    review_note = Column(Text, nullable=True)
    reviewed_by_user_id = Column(Integer, nullable=True)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))

