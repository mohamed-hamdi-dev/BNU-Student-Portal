"""Auth Pydantic schemas."""

from pydantic import BaseModel, EmailStr, Field, field_validator
from datetime import datetime


def _require_single_string(value, field_name: str) -> str:
    if not isinstance(value, str):
        raise TypeError(f"{field_name} must be a single string value")
    return value.strip()


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

    @field_validator("student_code", "national_id", mode="before")
    @classmethod
    def validate_recovery_lookup_fields(cls, value, info):
        if value is None:
            return None
        return _require_single_string(value, info.field_name)

    @field_validator("email", mode="before")
    @classmethod
    def validate_email(cls, value):
        return _require_single_string(value, "email").lower()


class OTPVerify(BaseModel):
    request_id: str  # For correlating the request if needed, or email
    otp: str = Field(..., min_length=6, max_length=6, pattern=r"^\d{6}$")

    @field_validator("request_id", "otp", mode="before")
    @classmethod
    def validate_single_string_fields(cls, value, info):
        return _require_single_string(value, info.field_name)


class ResetPassword(BaseModel):
    request_id: str
    otp: str = Field(..., min_length=6, max_length=6, pattern=r"^\d{6}$")
    new_password: str = Field(..., min_length=6)

    @field_validator("request_id", "otp", "new_password", mode="before")
    @classmethod
    def validate_single_string_fields(cls, value, info):
        return _require_single_string(value, info.field_name)


class AccountRequestCreate(BaseModel):
    full_name: str = Field(..., min_length=8)
    national_id: str = Field(..., min_length=14, max_length=20)
    college: str = Field(..., min_length=2)
    level: str = Field(..., min_length=1)
    email: EmailStr

    @field_validator("full_name", "national_id", "college", "level", mode="before")
    @classmethod
    def validate_account_request_strings(cls, value, info):
        return _require_single_string(value, info.field_name)

    @field_validator("email", mode="before")
    @classmethod
    def validate_account_request_email(cls, value):
        return _require_single_string(value, "email").lower()


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
