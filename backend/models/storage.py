"""Storage Item ORM model."""

from datetime import datetime, timezone
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, LargeBinary, String, Text
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
    file_bytes = Column(LargeBinary, nullable=True)

    # --- RAG Enhancement Fields ---
    extracted_text = Column(Text, nullable=True)
    chunks_count = Column(Integer, nullable=True, default=0)
    indexing_status = Column(String(32), nullable=False, default="pending")  # pending / indexed / failed
    indexing_error = Column(Text, nullable=True)

    # Extended metadata for filtering
    college = Column(String(200), nullable=True)
    program = Column(String(200), nullable=True)
    academic_year = Column(String(40), nullable=True)
    semester = Column(String(40), nullable=True)
    keywords = Column(String(500), nullable=True)
    priority = Column(Integer, nullable=True, default=0)
    source_type = Column(String(40), nullable=True)   # pdf / docx / text
    content_type = Column(String(100), nullable=True)  # regulation / guide / announcement / general

    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
