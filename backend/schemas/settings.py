"""Admin Settings Pydantic schemas."""

from datetime import datetime
from pydantic import BaseModel


class SettingsBase(BaseModel):
    notify_live_chat: bool = True
    notify_summary: bool = False
    notify_feedback: bool = False


class SettingsUpdate(SettingsBase):
    pass


class SettingsResponse(SettingsBase):
    id: int
    admin_id: int
    updated_at: datetime

    class Config:
        from_attributes = True
