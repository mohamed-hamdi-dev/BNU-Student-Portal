from pydantic import BaseModel, Field


class UserPreferencesUpdate(BaseModel):
    theme_preference: str | None = Field(default=None, pattern="^(light|dark|system)$")
    avatar_size_px: int | None = Field(default=None, ge=32, le=120)


class UserPreferencesResponse(BaseModel):
    theme_preference: str = Field(..., pattern="^(light|dark|system)$")
    avatar_size_px: int = Field(48, ge=32, le=120)
