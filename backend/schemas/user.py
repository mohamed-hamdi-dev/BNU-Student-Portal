"""
User Pydantic schemas.

Separates creation, updates, and responses. Ensures sensitive fields
(password, national_id) are NEVER accidentally returned to the client.
"""

from datetime import datetime
from pydantic import BaseModel, EmailStr, Field


# ── Base (Shared fields) ──────────────────────────────────────────────
class UserBase(BaseModel):
    username: str = Field(..., max_length=50)
    email: EmailStr
    full_name: str = Field(..., max_length=255)
    role: str = Field("student", pattern="^(admin|student|doctor|advisor)$")
    student_code: str | None = None
    admission_year: str | None = None
    college: str | None = None
    major: str | None = None
    level: str | None = None
    theme_preference: str = Field("system", pattern="^(light|dark|system)$")
    avatar_size_px: int = Field(48, ge=32, le=120)
    nationality: str | None = None
    gender: str | None = None
    birth_place: str | None = None


# ── Create (Admin creating a user) ────────────────────────────────────
class UserCreate(UserBase):
    username: str | None = Field(default=None, max_length=50)
    password: str = Field(..., min_length=6)
    recovery_email: EmailStr | None = None
    # Sensitive fields allowed during creation
    national_id: str | None = None
    nationality: str | None = None
    gender: str | None = None
    birth_place: str | None = None


# ── Update (Admin updating a user) ────────────────────────────────────
class UserUpdate(BaseModel):
    email: EmailStr | None = None
    recovery_email: EmailStr | None = None
    full_name: str | None = None
    role: str | None = Field(None, pattern="^(admin|student|doctor|advisor)$")
    student_code: str | None = None
    admission_year: str | None = None
    college: str | None = None
    major: str | None = None
    level: str | None = None
    nationality: str | None = None
    gender: str | None = None
    birth_place: str | None = None
    is_active: bool | None = None
    # Sensitive options
    national_id: str | None = None
    password: str | None = Field(None, min_length=6)


# ── Response (Safe for all clients) ───────────────────────────────────
class UserProfileResponse(UserBase):
    """
    Safe user profile returned to the frontend.
    Omits password_hash only.
    """
    id: int
    is_active: bool
    national_id: str | None = None
    must_change_password: bool = False
    password_changed_at: datetime | None = None
    password_expires_at: datetime | None = None
    password_expired: bool = False
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ── Response (Admin View) ─────────────────────────────────────────────
class UserAdminResponse(UserProfileResponse):
    """
    Extended user view for admins. Still omits password,
    but may include other fields if needed.
    """
    national_id: str | None = None
    nationality: str | None = None
    gender: str | None = None
    birth_place: str | None = None

    class Config:
        from_attributes = True
