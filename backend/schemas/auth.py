"""Auth Pydantic schemas."""

from pydantic import BaseModel, EmailStr, Field
from datetime import datetime


# ── Tokens ────────────────────────────────────────────────────────────
class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict  # Will hold UserProfileResponse dict securely


class TokenPayload(BaseModel):
    sub: str | None = None
    exp: int | None = None


# ── Login & Passwords ─────────────────────────────────────────────────
class LoginRequest(BaseModel):
    username: str
    password: str


class ChangePassword(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=6)


# ── OTP ───────────────────────────────────────────────────────────────
class OTPRequest(BaseModel):
    student_code: str | None = None
    national_id: str | None = None
    email: EmailStr


class OTPVerify(BaseModel):
    request_id: str  # For correlating the request if needed, or email
    otp: str = Field(..., min_length=6, max_length=6, pattern=r"^\d{6}$")


class ResetPassword(BaseModel):
    request_id: str
    otp: str = Field(..., min_length=6, max_length=6, pattern=r"^\d{6}$")
    new_password: str = Field(..., min_length=6)


class AccountRequestCreate(BaseModel):
    full_name: str = Field(..., min_length=8)
    national_id: str = Field(..., min_length=14, max_length=20)
    college: str = Field(..., min_length=2)
    level: str = Field(..., min_length=1)
    email: EmailStr


class AccountRequestReview(BaseModel):
    action: str = Field(..., pattern="^(approve|reject)$")
    review_note: str | None = None


class AccountRequestItem(BaseModel):
    id: int
    full_name: str
    national_id: str
    college: str
    level: str
    email: EmailStr
    status: str
    review_note: str | None = None
    reviewed_by_user_id: int | None = None
    reviewed_at: datetime | None = None
    created_at: datetime

    class Config:
        from_attributes = True
