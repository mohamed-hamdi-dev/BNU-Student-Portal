"""
User ORM model.

Stores all user data. Sensitive fields (password_hash, national_id, etc.)
are NEVER exposed to the frontend — the schemas layer controls what's returned.
"""

from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text
from core.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False)

    # Role: "admin", "student", "doctor", "advisor"
    role = Column(String(20), nullable=False, default="student", index=True)

    # Student-specific fields (nullable for admins)
    student_code = Column(String(50), unique=True, nullable=True)  # e.g. BNU2025-7781
    admission_year = Column(String(20), nullable=True)  # e.g. 2025-2026
    college = Column(String(100), nullable=True)
    major = Column(String(100), nullable=True)
    level = Column(String(20), nullable=True)  # "Level 1" .. "Level 4"

    # Sensitive fields — NEVER sent to frontend
    national_id = Column(String(50), nullable=True)
    nationality = Column(String(50), nullable=True)
    gender = Column(String(10), nullable=True)
    birth_place = Column(String(100), nullable=True)

    # Status
    is_active = Column(Boolean, nullable=False, default=True)
    theme_preference = Column(String(10), nullable=False, default="system")
    avatar_size_px = Column(Integer, nullable=False, default=48)
    must_change_password = Column(Boolean, nullable=False, default=False)
    password_changed_at = Column(DateTime(timezone=True), nullable=True)
    # JSON array of recent bcrypt hashes (newest first)
    password_history_json = Column(Text, nullable=False, default="[]")
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    def __repr__(self):
        return f"<User id={self.id} username={self.username} role={self.role}>"
