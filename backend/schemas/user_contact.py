from datetime import datetime
from pydantic import BaseModel, EmailStr, Field


class UserContactSettingsUpdate(BaseModel):
    display_name: str | None = Field(default=None, max_length=255)
    recovery_email: EmailStr | None = None
    phone_number: str | None = Field(default=None, max_length=40)


class UserContactSettingsResponse(BaseModel):
    display_name: str
    recovery_email: EmailStr
    phone_number: str | None = None
    updated_at: datetime | None = None
