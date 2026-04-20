"""Storage Item ORM model."""

from datetime import datetime, timezone
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String
from core.database import Base


class StorageItem(Base):
    __tablename__ = "storage_items"

    id = Column(Integer, primary_key=True, autoincrement=True)
    file_name = Column(String(255), nullable=False)
    level = Column(String(255), nullable=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    category = Column(String(100), nullable=True)
    is_favorite = Column(Boolean, nullable=False, default=False)
    is_indexed = Column(Boolean, nullable=False, default=False)
    stored_name = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
