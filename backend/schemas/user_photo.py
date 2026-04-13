from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class UserProfilePhotoResponse(BaseModel):
    id: int
    user_id: int = Field(alias="userId")
    user_name: str | None = Field(default=None, alias="userName")
    username: str | None = None
    student_code: str | None = Field(default=None, alias="studentCode")
    college: str | None = None
    level: str | None = None
    status: str
    rejection_reason: str | None = Field(default=None, alias="rejectionReason")
    file_url: str = Field(alias="fileUrl")
    created_at: datetime = Field(alias="createdAt")
    reviewed_at: datetime | None = Field(default=None, alias="reviewedAt")
    reviewed_by: int | None = Field(default=None, alias="reviewedBy")

    model_config = ConfigDict(populate_by_name=True, from_attributes=True)


class UserProfilePhotoRejectRequest(BaseModel):
    reason: str = Field(min_length=3, max_length=500)
