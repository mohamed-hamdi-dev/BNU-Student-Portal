"""
Admin Settings Router.
Handles preferences like notifications for an admin user.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from core.deps import get_db, get_current_user, require_role
from models.user import User
from models.settings import AdminSettings
from schemas.settings import SettingsUpdate, SettingsResponse

router = APIRouter(prefix="/settings", tags=["settings"], dependencies=[Depends(require_role("admin"))])


# ── 1. Get Settings ───────────────────────────────────────────────────
@router.get("", response_model=SettingsResponse)
async def get_my_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get the current admin's settings. Auto-create default if it doesn't exist."""
    settings = db.query(AdminSettings).filter(AdminSettings.admin_id == current_user.id).first()
    
    if not settings:
        settings = AdminSettings(admin_id=current_user.id)
        db.add(settings)
        db.commit()
        db.refresh(settings)

    return settings


# ── 2. Update Settings ────────────────────────────────────────────────
@router.patch("", response_model=SettingsResponse)
async def update_my_settings(
    settings_in: SettingsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update admin preferences."""
    settings = db.query(AdminSettings).filter(AdminSettings.admin_id == current_user.id).first()
    
    if not settings:
        settings = AdminSettings(admin_id=current_user.id)
        db.add(settings)

    update_data = settings_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(settings, field, value)

    db.commit()
    db.refresh(settings)
    return settings
