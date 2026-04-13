"""Content Post ORM model."""

from datetime import datetime, timezone
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from core.database import Base


class ContentPost(Base):
    __tablename__ = "content_posts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    author_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    # Historical SQLite data stores human-readable scopes longer than 20 chars.
    target_level = Column(String(255), nullable=True)
    subject = Column(String(255), nullable=False)
    category = Column(String(100), nullable=True)
    body = Column(Text, nullable=True)
    content_type = Column(String(32), nullable=True)
    tags = Column(Text, nullable=True)
    college = Column(String(255), nullable=True)
    level = Column(String(64), nullable=True)
    program = Column(String(128), nullable=True)
    file_url = Column(String(1024), nullable=True)
    academic_year = Column(String(32), nullable=True)
    semester = Column(String(64), nullable=True)
    display_priority = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
