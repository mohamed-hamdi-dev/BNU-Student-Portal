"""
Users router.
Handles CRUD logic for users. Requires admin role for listing/modifying others.
"""

import json
import secrets
import csv
import io
import re
import zipfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import List
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from sqlalchemy import and_, func, or_
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from core.config import get_settings
from core.email import send_email
from core.deps import get_db, get_current_user, require_role, resolve_authenticated_user_from_token, security_scheme
from core.security import hash_password
from models.academic import AcademicState
from models.user_photo import UserProfilePhoto
from models.account_request import AccountRequest
from models.user import User
from models.user_contact import UserContactSettings
from schemas.user import UserCreate, UserUpdate, UserProfileResponse, UserAdminResponse
from schemas.auth import AccountRequestReview, AccountRequestItem
from schemas.user_contact import UserContactSettingsResponse, UserContactSettingsUpdate
from schemas.user_photo import UserProfilePhotoRejectRequest, UserProfilePhotoResponse
from schemas.user_preferences import UserPreferencesResponse, UserPreferencesUpdate

router = APIRouter(prefix="/users", tags=["users"])
PROFILE_PHOTOS_DIR = Path(__file__).resolve().parent.parent / "storage_files" / "profile_photos"
PROFILE_PHOTOS_DIR.mkdir(parents=True, exist_ok=True)
PHOTO_MAX_BYTES = 5 * 1024 * 1024
PHOTO_ALLOWED_EXT = {".jpg", ".jpeg", ".png"}
GENERAL_MAJOR_KEYS = {"", "general", "عام", "بدونتخصص", "بدون_تخصص", "none", "-", "null"}
COLLEGE_ALIASES = {
    "cs": ["computer science", "علوم الحاسب", "حاسبات", "حاسبات ومعلومات"],
    "eng": ["engineering", "الهندسة"],
    "bus": ["business", "business administration", "إدارة الأعمال"],
    "med": ["medicine", "الطب"],
    "den": ["dentistry", "dental", "طب الأسنان"],
    "phr": ["pharmacy", "الصيدلة"],
}

COLLEGE_NUMERIC_CODES = {
    "cs": "030",
    "eng": "020",
    "bus": "040",
    "med": "050",
    "den": "060",
    "phr": "070",
}


def ensure_users_schema(db: Session) -> None:
    """Schema is managed centrally by ORM metadata creation."""
    return None


def _to_utc_datetime(value):
    if not value:
        return None
    if not isinstance(value, datetime):
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _password_expiry_metadata(user: User) -> tuple[bool, datetime | None]:
    settings = get_settings()
    max_age_days = int(getattr(settings, "PASSWORD_MAX_AGE_DAYS", 0) or 0)
    changed_at = _to_utc_datetime(getattr(user, "password_changed_at", None))
    if max_age_days <= 0:
        return False, None
    if not changed_at:
        return True, None
    expires_at = changed_at + timedelta(days=max_age_days)
    return datetime.now(timezone.utc) >= expires_at, expires_at


async def _send_account_credentials_email(email: str, username: str, temp_password: str):
    return await send_email(
        to=email,
        subject="BNU Portal - Temporary Login Credentials",
        html=(
            "<p>Your account has been created in BNU Portal.</p>"
            f"<p><strong>Username:</strong> {username}</p>"
            f"<p><strong>Temporary Password:</strong> {temp_password}</p>"
            "<p>Please login and change your password immediately.</p>"
        ),
    )


async def _send_account_update_email(email: str, username: str, university_email: str, temp_password: str | None = None):
    password_block = (
        f"<p><strong>Updated Password:</strong> {temp_password}</p>"
        "<p>Please login using the new password.</p>"
        if str(temp_password or "").strip()
        else "<p>Your account data has been updated successfully.</p>"
    )
    return await send_email(
        to=email,
        subject="BNU Portal - Account Details Updated",
        html=(
            "<p>Your university portal account details were updated by the administration.</p>"
            f"<p><strong>Username:</strong> {username}</p>"
            f"<p><strong>University Email:</strong> {university_email}</p>"
            f"{password_block}"
        ),
    )


def _current_academic_start_year(now_value: datetime | None = None) -> int:
    now_utc = now_value or datetime.now(timezone.utc)
    # Academic year starts in September and ends in June.
    return now_utc.year if now_utc.month >= 9 else now_utc.year - 1


def _generate_temp_password(length: int = 10) -> str:
    chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%"
    return "".join(secrets.choice(chars) for _ in range(length))


def _generate_student_code(db: Session, *, college_value: str | None, level_value: str | None) -> str:
    ccc = _resolve_college_numeric_code(str(college_value or ""))
    batch_num = _to_year_number(level_value)
    bbb = str(batch_num if batch_num > 0 else 0).zfill(2)

    prefix = f"BNU-{ccc}-{bbb}-"
    existing = db.query(User.student_code).filter(User.student_code.like(f"{prefix}%")).all()
    max_suffix = 0
    for (student_code,) in existing:
        raw = str(student_code or "")
        suffix = raw.split("-")[-1] if "-" in raw else ""
        if suffix.isdigit():
            max_suffix = max(max_suffix, int(suffix))

    next_suffix = str(max_suffix + 1).zfill(4)
    return f"{prefix}{next_suffix}"


def _photo_file_url(stored_name: str) -> str:
    return f"/api/users/profile-photo-files/{stored_name}"


def _decode_json(raw: str, fallback):
    try:
        return json.loads(raw) if raw else fallback
    except json.JSONDecodeError:
        return fallback


def _normalize_text_key(value) -> str:
    return str(value or "").strip().lower()


def _compact_text_key(value) -> str:
    return _normalize_text_key(value).replace(" ", "")


def _to_year_number(value) -> int:
    raw = str(value or "").strip()
    if not raw:
        return 0
    # Normalize Arabic/Persian digits and common Arabic letter variations.
    digit_map = str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹", "01234567890123456789")
    normalized_raw = raw.translate(digit_map)
    normalized_raw = (
        normalized_raw.replace("أ", "ا")
        .replace("إ", "ا")
        .replace("آ", "ا")
        .replace("ة", "ه")
        .replace("ى", "ي")
        .replace("ـ", "")
        .replace("-", " ")
        .replace("_", " ")
    )
    digits = "".join(ch for ch in normalized_raw if ch.isdigit())
    if digits:
        return int(digits)
    lowered = normalized_raw.lower()
    mapping = {
        "first": 1,
        "second": 2,
        "third": 3,
        "fourth": 4,
        "level1": 1,
        "level2": 2,
        "level3": 3,
        "level4": 4,
        "level5": 5,
        "level6": 6,
        "level7": 7,
        "level8": 8,
        "year1": 1,
        "year2": 2,
        "year3": 3,
        "year4": 4,
        "year5": 5,
        "year6": 6,
        "year7": 7,
        "year8": 8,
        "الفرقه الاولي": 1,
        "الفرقه الاولي": 1,
        "الفرقه الثانيه": 2,
        "الفرقه الثالثه": 3,
        "الفرقه الرابعه": 4,
        "الفرقه الخامسه": 5,
        "الفرقه السادسه": 6,
        "الفرقه السابعه": 7,
        "الفرقه الثامنه": 8,
        "الفرقه التاسعه": 9,
        "الفرقه العاشره": 10,
        "الاولى": 1,
        "الأولى": 1,
        "اولى": 1,
        "الفرقة الاولى": 1,
        "الفرقة الأولى": 1,
        "الثانية": 2,
        "ثانية": 2,
        "الفرقة الثانية": 2,
        "الثالثة": 3,
        "ثالثة": 3,
        "الفرقة الثالثة": 3,
        "الرابعة": 4,
        "رابعة": 4,
        "الفرقة الرابعة": 4,
        "الخامسة": 5,
        "خامسة": 5,
        "الفرقة الخامسة": 5,
        "السادسة": 6,
        "سادسة": 6,
        "الفرقة السادسة": 6,
        "السابعة": 7,
        "سابعة": 7,
        "الفرقة السابعة": 7,
        "الثامنة": 8,
        "ثامنة": 8,
        "الفرقة الثامنة": 8,
        "التاسعة": 9,
        "تاسعة": 9,
        "الفرقة التاسعة": 9,
        "العاشرة": 10,
        "عاشرة": 10,
        "الفرقة العاشرة": 10,
    }
    for label, year_no in mapping.items():
        if label in lowered:
            return year_no
    return 0


def _is_general_major(value) -> bool:
    return _compact_text_key(value) in GENERAL_MAJOR_KEYS


def _digits_only(value) -> str:
    return "".join(ch for ch in str(value or "") if ch.isdigit())


def _resolve_college_numeric_code(college_value: str) -> str:
    normalized = _normalize_text_key(college_value)
    compact = _compact_text_key(college_value)
    # Direct match by short key
    if compact in COLLEGE_NUMERIC_CODES:
        return COLLEGE_NUMERIC_CODES[compact]
    # Match aliases
    for code_key, labels in COLLEGE_ALIASES.items():
        normalized_labels = {_normalize_text_key(item) for item in labels}
        compact_labels = {_compact_text_key(item) for item in labels}
        if normalized in normalized_labels or compact in compact_labels:
            return COLLEGE_NUMERIC_CODES.get(code_key, "999")
    return "999"


def _resolve_admission_yy(admission_year: str | None, student_code: str | None) -> str:
    # Priority 1: admission_year like 2024-2025 -> 24
    ay_digits = _digits_only(admission_year)
    if len(ay_digits) >= 4:
        return ay_digits[:4][-2:]
    # Priority 2: student_code starts with year-like digits
    sc_digits = _digits_only(student_code)
    if len(sc_digits) >= 2:
        if len(sc_digits) >= 4 and sc_digits[:4].startswith(("19", "20")):
            return sc_digits[:4][-2:]
        return sc_digits[:2]
    # Fallback: current year
    return str(datetime.now(timezone.utc).year)[-2:]


def _generate_student_username(
    db: Session,
    *,
    admission_year: str | None,
    college_value: str | None,
    level_value: str | None,
    student_code: str | None,
) -> str:
    yy = _resolve_admission_yy(admission_year, student_code)
    ccc = _resolve_college_numeric_code(str(college_value or ""))
    batch_num = _to_year_number(level_value)
    bbb = str(batch_num if batch_num > 0 else 0).zfill(3)

    prefix = f"{yy}{ccc}{bbb}"
    existing = db.query(User.username).filter(User.username.like(f"{prefix}%")).all()
    max_suffix = 0
    for (username,) in existing:
        raw = str(username or "")
        suffix = raw[len(prefix) :]
        if suffix.isdigit():
            max_suffix = max(max_suffix, int(suffix))

    next_suffix = str(max_suffix + 1).zfill(3)
    return f"{prefix}{next_suffix}"


def _get_registration_settings(db: Session) -> dict:
    state = db.query(AcademicState).filter(AcademicState.id == 1).first()
    if not state:
        return {}
    settings = _decode_json(state.registration_settings_json, {})
    return settings if isinstance(settings, dict) else {}


def _resolve_college_policy(college_value: str, college_policies: dict) -> tuple[dict | None, str]:
    if not isinstance(college_policies, dict):
        return None, ""

    def _alias_keys(raw_value: str) -> set[str]:
        normalized = _normalize_text_key(raw_value)
        compact = _compact_text_key(raw_value)
        keys = {k for k in [normalized, compact] if k}
        direct = compact.lower()

        if direct in COLLEGE_ALIASES:
            for item in COLLEGE_ALIASES[direct]:
                keys.add(_normalize_text_key(item))
                keys.add(_compact_text_key(item))

        for code, labels in COLLEGE_ALIASES.items():
            normalized_labels = [_normalize_text_key(item) for item in labels]
            compact_labels = [_compact_text_key(item) for item in labels]
            if normalized in normalized_labels or compact in compact_labels:
                keys.add(code)
                for item in labels:
                    keys.add(_normalize_text_key(item))
                    keys.add(_compact_text_key(item))
        return {k for k in keys if k}

    college_keys = _alias_keys(str(college_value or ""))
    for raw_key, policy in college_policies.items():
        if not isinstance(policy, dict):
            continue
        policy_keys = _alias_keys(str(raw_key or ""))
        if college_keys.intersection(policy_keys):
            return policy, str(raw_key)
    return None, ""


def _extract_track_labels(policy: dict) -> set[str]:
    tracks = policy.get("tracks") if isinstance(policy, dict) else []
    labels = set()
    if not isinstance(tracks, list):
        return labels
    for track in tracks:
        if isinstance(track, str):
            label = track.strip()
            if label:
                labels.add(_normalize_text_key(label))
                labels.add(_compact_text_key(label))
            continue
        if isinstance(track, dict):
            for key in ["id", "name"]:
                label = str(track.get(key) or "").strip()
                if label:
                    labels.add(_normalize_text_key(label))
                    labels.add(_compact_text_key(label))
    return labels


def _sanitize_user_academic_fields(payload: dict, db: Session):
    role = _normalize_text_key(payload.get("role"))
    if role == "admin":
        payload["student_code"] = None
        payload["admission_year"] = None
        payload["college"] = None
        payload["major"] = None
        payload["level"] = None
        return

    if role in {"doctor", "advisor"}:
        payload["student_code"] = None
        payload["admission_year"] = None
        payload["level"] = None
        if not str(payload.get("college") or "").strip():
            raise HTTPException(status_code=400, detail="Doctor/advisor must have a college")
        if role == "advisor":
            payload["major"] = None
            return
        major_val = str(payload.get("major") or "").strip()
        if not major_val or _is_general_major(major_val):
            payload["major"] = None
            return
        settings = _get_registration_settings(db)
        college_policies = settings.get("collegePolicies") if isinstance(settings, dict) else {}
        policy, _ = _resolve_college_policy(str(payload.get("college") or ""), college_policies if isinstance(college_policies, dict) else {})
        track_labels = _extract_track_labels(policy) if policy else set()
        if track_labels and _normalize_text_key(major_val) not in track_labels and _compact_text_key(major_val) not in track_labels:
            raise HTTPException(status_code=400, detail="Major must belong to selected college")
        payload["major"] = major_val
        return

    # Student validation (strict branching rules).
    if not str(payload.get("college") or "").strip():
        raise HTTPException(status_code=400, detail="Student must have a college")
    if not str(payload.get("level") or "").strip():
        raise HTTPException(status_code=400, detail="Student must have current year/level")

    settings = _get_registration_settings(db)
    college_policies = settings.get("collegePolicies") if isinstance(settings, dict) else {}
    policy, _ = _resolve_college_policy(str(payload.get("college") or ""), college_policies if isinstance(college_policies, dict) else {})
    if not policy:
        raise HTTPException(status_code=400, detail="No college policy found for selected college")

    study_year = _to_year_number(payload.get("level"))
    if study_year <= 0:
        raise HTTPException(status_code=400, detail="Invalid study year")

    branching_year = _to_year_number(policy.get("branchingYear"))
    major_val = str(payload.get("major") or "").strip()
    track_labels = _extract_track_labels(policy)

    if branching_year > 0 and study_year < branching_year:
        # General years must not store specialization.
        payload["major"] = None
        return

    if not major_val or _is_general_major(major_val):
        # During coordination, final specialization can remain empty until admin assignment.
        payload["major"] = None
        return

    if track_labels and _normalize_text_key(major_val) not in track_labels and _compact_text_key(major_val) not in track_labels:
        raise HTTPException(status_code=400, detail="Specialization must belong to selected college")
    payload["major"] = major_val


def _serialize_photo(row: UserProfilePhoto, user: User | None = None) -> UserProfilePhotoResponse:
    return UserProfilePhotoResponse(
        id=row.id,
        userId=row.user_id,
        userName=user.full_name if user else None,
        username=user.username if user else None,
        studentCode=user.student_code if user else None,
        college=user.college if user else None,
        level=user.level if user else None,
        status=row.status,
        rejectionReason=row.rejection_reason,
        fileUrl=_photo_file_url(row.stored_name),
        createdAt=row.created_at,
        reviewedAt=row.reviewed_at,
        reviewedBy=row.reviewed_by,
    )


def _build_user_admin_payload(user: User, db: Session) -> dict:
    payload = UserAdminResponse.model_validate(user).model_dump(mode="json")
    contact_row = db.query(UserContactSettings).filter(UserContactSettings.user_id == user.id).first()
    payload["recovery_email"] = contact_row.recovery_email if contact_row and contact_row.recovery_email else None
    return payload


def _normalize_photo_status_filter(value: str | None) -> str:
    raw = str(value or "").strip().lower()
    if raw in {"approved", "pending_review", "rejected", "all"}:
        return raw
    if raw in {"pending", "review"}:
        return "pending_review"
    return "all"


def _sanitize_export_name(value: str) -> str:
    cleaned = re.sub(r"\s+", "_", str(value or "").strip())
    cleaned = re.sub(r"[^\w\-]+", "", cleaned, flags=re.UNICODE)
    return cleaned[:80] or "student"


def _sanitize_export_ascii(value: str) -> str:
    # HTTP header filenames must be ASCII-safe in many environments.
    cleaned = _sanitize_export_name(value)
    ascii_only = cleaned.encode("ascii", "ignore").decode("ascii")
    ascii_only = re.sub(r"[^A-Za-z0-9_\-]+", "", ascii_only)
    return (ascii_only[:80] or "scope").strip("_-") or "scope"


def get_current_user_for_photo_access(
    token: str | None = Query(default=None),
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme),
    db: Session = Depends(get_db),
):
    raw_token = credentials.credentials if credentials else (token or "").strip()
    if not raw_token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    return resolve_authenticated_user_from_token(raw_token, db)


# â”€â”€ 1. Get Me (Current User) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
@router.get("/me", response_model=UserProfileResponse)
async def read_users_me(current_user: User = Depends(get_current_user)):
    """Get the currently logged-in user profile."""
    expired, expires_at = _password_expiry_metadata(current_user)
    return {
        **UserProfileResponse.model_validate(current_user).model_dump(mode="json"),
        "password_expires_at": expires_at,
        "password_expired": bool(expired),
        "must_change_password": bool(getattr(current_user, "must_change_password", False) or expired),
    }


@router.get("/me/contact-settings", response_model=UserContactSettingsResponse)
async def read_my_contact_settings(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get per-user editable contact settings used by the portal UI and OTP flow."""
    settings_row = db.query(UserContactSettings).filter(UserContactSettings.user_id == current_user.id).first()
    if not settings_row:
        return UserContactSettingsResponse(
            display_name=current_user.full_name,
            recovery_email=current_user.email,
            phone_number=None,
            updated_at=None,
        )
    return UserContactSettingsResponse(
        display_name=settings_row.display_name or current_user.full_name,
        recovery_email=settings_row.recovery_email or current_user.email,
        phone_number=settings_row.phone_number,
        updated_at=settings_row.updated_at,
    )


@router.put("/me/contact-settings", response_model=UserContactSettingsResponse)
async def upsert_my_contact_settings(
    body: UserContactSettingsUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create or update current user's contact settings without touching university profile data."""
    settings_row = db.query(UserContactSettings).filter(UserContactSettings.user_id == current_user.id).first()
    if not settings_row:
        settings_row = UserContactSettings(user_id=current_user.id)
        db.add(settings_row)

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(settings_row, field, value)

    # Fallback defaults if client sends blank values.
    if not settings_row.display_name:
        settings_row.display_name = current_user.full_name
    if not settings_row.recovery_email:
        settings_row.recovery_email = current_user.email

    db.commit()
    db.refresh(settings_row)

    return UserContactSettingsResponse(
        display_name=settings_row.display_name,
        recovery_email=settings_row.recovery_email,
        phone_number=settings_row.phone_number,
        updated_at=settings_row.updated_at,
    )


@router.get("/me/preferences", response_model=UserPreferencesResponse)
async def read_my_preferences(
    current_user: User = Depends(get_current_user),
):
    theme = str(getattr(current_user, "theme_preference", "system") or "system").lower()
    if theme not in {"light", "dark", "system"}:
        theme = "system"
    avatar_size = int(getattr(current_user, "avatar_size_px", 48) or 48)
    if avatar_size < 32:
        avatar_size = 32
    if avatar_size > 120:
        avatar_size = 120
    return UserPreferencesResponse(theme_preference=theme, avatar_size_px=avatar_size)


@router.put("/me/preferences", response_model=UserPreferencesResponse)
async def upsert_my_preferences(
    body: UserPreferencesUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if body.theme_preference is not None:
        current_user.theme_preference = body.theme_preference
    if body.avatar_size_px is not None:
        current_user.avatar_size_px = int(body.avatar_size_px)
    db.add(current_user)
    db.commit()
    db.refresh(current_user)
    theme = str(getattr(current_user, "theme_preference", "system") or "system").lower()
    if theme not in {"light", "dark", "system"}:
        theme = "system"
    avatar_size = int(getattr(current_user, "avatar_size_px", 48) or 48)
    if avatar_size < 32:
        avatar_size = 32
    if avatar_size > 120:
        avatar_size = 120
    return UserPreferencesResponse(theme_preference=theme, avatar_size_px=avatar_size)


@router.post("/me/profile-photo", response_model=UserProfilePhotoResponse)
async def upload_my_profile_photo(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="File name is required")
    ext = Path(file.filename).suffix.lower()
    if ext not in PHOTO_ALLOWED_EXT:
        raise HTTPException(status_code=400, detail="Only JPG and PNG files are allowed")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file is not allowed")
    if len(content) > PHOTO_MAX_BYTES:
        raise HTTPException(status_code=413, detail="File is too large (max 5MB)")

    stored_name = f"{uuid4().hex}{ext}"
    destination = PROFILE_PHOTOS_DIR / stored_name
    destination.write_bytes(content)

    role_key = (current_user.role or "").lower()
    is_student = role_key == "student"
    row = UserProfilePhoto(
        user_id=current_user.id,
        stored_name=stored_name,
        original_name=Path(file.filename).name,
        mime_type=file.content_type or "application/octet-stream",
        size_bytes=len(content),
        status="pending_review" if is_student else "approved",
        rejection_reason=None,
        reviewed_by=None if is_student else current_user.id,
        reviewed_at=None if is_student else datetime.now(timezone.utc),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _serialize_photo(row, current_user)


@router.get("/me/profile-photo", response_model=UserProfilePhotoResponse | None)
async def get_my_profile_photo(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    pending = (
        db.query(UserProfilePhoto)
        .filter(UserProfilePhoto.user_id == current_user.id, UserProfilePhoto.status == "pending_review")
        .order_by(UserProfilePhoto.created_at.desc())
        .first()
    )
    if pending:
        return _serialize_photo(pending, current_user)

    # Return latest reviewed decision (approved/rejected) so student sees newest status.
    latest_reviewed = (
        db.query(UserProfilePhoto)
        .filter(
            UserProfilePhoto.user_id == current_user.id,
            UserProfilePhoto.status.in_(["approved", "rejected"]),
        )
        .order_by(UserProfilePhoto.reviewed_at.desc(), UserProfilePhoto.created_at.desc())
        .first()
    )
    if latest_reviewed:
        return _serialize_photo(latest_reviewed, current_user)
    return None


@router.get("/me/profile-photo/approved", response_model=UserProfilePhotoResponse | None)
async def get_my_approved_profile_photo(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    latest_approved = (
        db.query(UserProfilePhoto)
        .filter(
            UserProfilePhoto.user_id == current_user.id,
            UserProfilePhoto.status == "approved",
        )
        .order_by(UserProfilePhoto.reviewed_at.desc(), UserProfilePhoto.created_at.desc())
        .first()
    )
    if latest_approved:
        return _serialize_photo(latest_approved, current_user)
    return None


@router.get("/profile-photo-files/{stored_name}")
async def serve_profile_photo_file(
    stored_name: str,
    current_user: User = Depends(get_current_user_for_photo_access),
):
    file_path = (PROFILE_PHOTOS_DIR / Path(stored_name).name).resolve()
    if not file_path.exists() or not str(file_path).startswith(str(PROFILE_PHOTOS_DIR.resolve())):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(path=file_path, filename=file_path.name)


@router.get("/profile-photos/pending", response_model=List[UserProfilePhotoResponse], dependencies=[Depends(require_role("admin"))])
async def list_pending_profile_photos(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    rows = (
        db.query(UserProfilePhoto, User)
        .join(User, User.id == UserProfilePhoto.user_id)
        .filter(UserProfilePhoto.status == "pending_review", User.role == "student")
        .order_by(UserProfilePhoto.created_at.asc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return [_serialize_photo(row, user) for row, user in rows]


@router.get("/profile-photos/review", dependencies=[Depends(require_role("admin"))])
async def list_profile_photos_for_review(
    college: str | None = Query(default=None),
    level: str | None = Query(default=None),
    search: str | None = Query(default=None),
    status_filter: str = Query(default="all", alias="status"),
    skip: int = 0,
    limit: int = 200,
    db: Session = Depends(get_db),
):
    normalized_status = _normalize_photo_status_filter(status_filter)

    user_filters = [User.role == "student"]
    college_value = str(college or "").strip()
    if college_value:
        user_filters.append(func.lower(User.college) == college_value.lower())
    level_value = str(level or "").strip()
    if level_value:
        normalized_level = str(_to_year_number(level_value)).strip()
        level_lower = level_value.lower()
        level_conditions = [func.lower(func.coalesce(User.level, "")) == level_lower]
        if normalized_level and normalized_level != "0":
            level_conditions.append(func.lower(func.coalesce(User.level, "")) == normalized_level.lower())
        user_filters.append(or_(*level_conditions))
    search_value = str(search or "").strip()
    if search_value:
        token = f"%{search_value}%"
        user_filters.append(
            or_(
                User.full_name.ilike(token),
                User.username.ilike(token),
                User.student_code.ilike(token),
            )
        )

    latest_status_sq = (
        db.query(
            UserProfilePhoto.user_id.label("user_id"),
            func.max(UserProfilePhoto.id).label("latest_status_photo_id"),
        )
        .join(User, User.id == UserProfilePhoto.user_id)
        .filter(*user_filters)
        .filter(UserProfilePhoto.status == normalized_status if normalized_status != "all" else True)
        .group_by(UserProfilePhoto.user_id)
        .subquery()
    )

    latest_any_sq = (
        db.query(
            UserProfilePhoto.user_id.label("user_id"),
            func.max(UserProfilePhoto.id).label("latest_photo_id"),
        )
        .join(User, User.id == UserProfilePhoto.user_id)
        .filter(*user_filters)
        .group_by(UserProfilePhoto.user_id)
        .subquery()
    )

    latest_approved_sq = (
        db.query(
            UserProfilePhoto.user_id.label("user_id"),
            func.max(UserProfilePhoto.id).label("latest_approved_photo_id"),
        )
        .join(User, User.id == UserProfilePhoto.user_id)
        .filter(*user_filters)
        .filter(UserProfilePhoto.status == "approved")
        .group_by(UserProfilePhoto.user_id)
        .subquery()
    )

    rows = (
        db.query(UserProfilePhoto, User)
        .join(latest_status_sq, latest_status_sq.c.latest_status_photo_id == UserProfilePhoto.id)
        .join(User, User.id == UserProfilePhoto.user_id)
        .order_by(UserProfilePhoto.created_at.desc())
        .offset(max(0, skip))
        .limit(max(1, min(limit, 1000)))
        .all()
    )

    total_students = db.query(User.id).filter(*user_filters).count()
    students_with_latest_approved = db.query(latest_approved_sq.c.user_id).count()
    students_without_approved = max(0, total_students - students_with_latest_approved)

    latest_any_map = {
        int(user_id): int(photo_id)
        for user_id, photo_id in db.query(latest_any_sq.c.user_id, latest_any_sq.c.latest_photo_id).all()
        if user_id and photo_id
    }
    latest_approved_map = {
        int(user_id): int(photo_id)
        for user_id, photo_id in db.query(latest_approved_sq.c.user_id, latest_approved_sq.c.latest_approved_photo_id).all()
        if user_id and photo_id
    }

    serialized = []
    for photo_row, user_row in rows:
        item = _serialize_photo(photo_row, user_row).model_dump(mode="json", by_alias=True)
        uid = int(user_row.id)
        item["isLatestForStudent"] = latest_any_map.get(uid) == int(photo_row.id)
        item["isLatestApprovedForStudent"] = latest_approved_map.get(uid) == int(photo_row.id)
        serialized.append(item)

    return {
        "items": serialized,
        "summary": {
            "total_students": total_students,
            "with_approved": students_with_latest_approved,
            "without_approved": students_without_approved,
        },
    }


@router.api_route("/profile-photos/export-cards", methods=["GET", "POST"])
async def export_card_photo_pack(
    college: str = Query(...),
    level: str = Query(...),
    include_non_approved: bool = Query(default=False),
    include_without_photo: bool = Query(default=True),
    search: str | None = Query(default=None),
    current_user: User = Depends(get_current_user_for_photo_access),
    db: Session = Depends(get_db),
):
    try:
        if str(getattr(current_user, "role", "")).lower() != "admin":
            raise HTTPException(status_code=403, detail="Access denied. Admin role is required")
        college_value = str(college or "").strip()
        level_value = str(level or "").strip()
        if not college_value or not level_value:
            raise HTTPException(status_code=400, detail="College and level are required")

        user_filters = [User.role == "student", func.lower(User.college) == college_value.lower()]
        normalized_level = str(_to_year_number(level_value)).strip()
        level_lower = level_value.lower()
        level_conditions = [func.lower(func.coalesce(User.level, "")) == level_lower]
        if normalized_level and normalized_level != "0":
            level_conditions.append(func.lower(func.coalesce(User.level, "")) == normalized_level.lower())
        user_filters.append(or_(*level_conditions))
        search_value = str(search or "").strip()
        if search_value:
            token = f"%{search_value}%"
            user_filters.append(
                or_(
                    User.full_name.ilike(token),
                    User.username.ilike(token),
                    User.student_code.ilike(token),
                )
            )

        students = db.query(User).filter(*user_filters).order_by(User.student_code.asc(), User.full_name.asc()).all()
        if not students:
            raise HTTPException(status_code=404, detail="No students found in selected scope")

        user_ids = [int(s.id) for s in students]

        approved_sq = (
            db.query(
                UserProfilePhoto.user_id.label("user_id"),
                func.max(UserProfilePhoto.id).label("photo_id"),
            )
            .filter(UserProfilePhoto.user_id.in_(user_ids), UserProfilePhoto.status == "approved")
            .group_by(UserProfilePhoto.user_id)
            .subquery()
        )
        approved_rows = db.query(UserProfilePhoto).join(approved_sq, approved_sq.c.photo_id == UserProfilePhoto.id).all()
        approved_map = {int(row.user_id): row for row in approved_rows}

        latest_any_map = {}
        if include_non_approved:
            any_sq = (
                db.query(
                    UserProfilePhoto.user_id.label("user_id"),
                    func.max(UserProfilePhoto.id).label("photo_id"),
                )
                .filter(UserProfilePhoto.user_id.in_(user_ids))
                .group_by(UserProfilePhoto.user_id)
                .subquery()
            )
            any_rows = db.query(UserProfilePhoto).join(any_sq, any_sq.c.photo_id == UserProfilePhoto.id).all()
            latest_any_map = {int(row.user_id): row for row in any_rows}

        archive_buffer = io.BytesIO()
        csv_buffer = io.StringIO()
        csv_writer = csv.writer(csv_buffer)
        csv_writer.writerow(["name", "username", "student_code", "college", "year", "image_file"])

        with zipfile.ZipFile(archive_buffer, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
            for student in students:
                selected = approved_map.get(int(student.id))
                if not selected and include_non_approved:
                    selected = latest_any_map.get(int(student.id))

                image_file_name = ""
                if selected:
                    original_ext = Path(str(selected.original_name or "")).suffix.lower()
                    ext = original_ext if original_ext in PHOTO_ALLOWED_EXT else ".jpg"
                    safe_code = _sanitize_export_name(student.student_code or student.username or str(student.id))
                    safe_name = _sanitize_export_name(student.full_name or student.username or "student")
                    image_file_name = f"{safe_code}_{safe_name}{ext}"

                    source_path = (PROFILE_PHOTOS_DIR / Path(selected.stored_name).name).resolve()
                    if source_path.exists() and str(source_path).startswith(str(PROFILE_PHOTOS_DIR.resolve())):
                        zf.write(str(source_path), arcname=f"images/{image_file_name}")
                    else:
                        image_file_name = ""

                if image_file_name or include_without_photo:
                    csv_writer.writerow(
                        [
                            str(student.full_name or ""),
                            str(student.username or ""),
                            str(student.student_code or ""),
                            str(student.college or ""),
                            str(student.level or ""),
                            image_file_name,
                        ]
                    )

            zf.writestr("cards_manifest.csv", csv_buffer.getvalue().encode("utf-8-sig"))

        archive_buffer.seek(0)
        safe_college = _sanitize_export_ascii(college_value)
        safe_level = _sanitize_export_ascii(level_value)
        filename = f"card-photos-{safe_college}-{safe_level}.zip"
        return StreamingResponse(
            archive_buffer,
            media_type="application/zip",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Export failed: {exc}") from exc


@router.post("/profile-photos/{photo_id}/approve", response_model=UserProfilePhotoResponse, dependencies=[Depends(require_role("admin"))])
async def approve_profile_photo(
    photo_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    row = db.query(UserProfilePhoto).filter(UserProfilePhoto.id == photo_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Photo request not found")

    db.query(UserProfilePhoto).filter(
        UserProfilePhoto.user_id == row.user_id,
        UserProfilePhoto.status == "approved",
        UserProfilePhoto.id != row.id,
    ).update(
        {"status": "replaced"},
        synchronize_session=False,
    )

    row.status = "approved"
    row.rejection_reason = None
    row.reviewed_by = current_user.id
    from datetime import datetime, timezone
    row.reviewed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(row)

    user = db.query(User).filter(User.id == row.user_id).first()
    return _serialize_photo(row, user)


@router.post("/profile-photos/{photo_id}/reject", response_model=UserProfilePhotoResponse, dependencies=[Depends(require_role("admin"))])
async def reject_profile_photo(
    photo_id: int,
    body: UserProfilePhotoRejectRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    row = db.query(UserProfilePhoto).filter(UserProfilePhoto.id == photo_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Photo request not found")

    row.status = "rejected"
    row.rejection_reason = body.reason.strip()
    from datetime import datetime, timezone
    row.reviewed_by = current_user.id
    row.reviewed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(row)
    user = db.query(User).filter(User.id == row.user_id).first()
    return _serialize_photo(row, user)


# â”€â”€ 2. List Users (Admin Only) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
@router.get("", response_model=List[UserAdminResponse], dependencies=[Depends(require_role("admin"))])
async def read_users(
    skip: int = 0,
    limit: int = 100,
    search: str | None = None,
    db: Session = Depends(get_db)
):
    """List all users. Admin only."""
    query = db.query(User)

    if search:
        search_filter = f"%{search}%"
        query = query.filter(
            or_(
                User.username.ilike(search_filter),
                User.email.ilike(search_filter),
                User.full_name.ilike(search_filter),
                User.student_code.ilike(search_filter),
            )
        )

    rows = query.offset(skip).limit(limit).all()
    return [_build_user_admin_payload(user, db) for user in rows]


# â”€â”€ 3. Get User By ID (Admin Only) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
@router.get("/{user_id}", response_model=UserAdminResponse, dependencies=[Depends(require_role("admin"))])
async def read_user(user_id: int, db: Session = Depends(get_db)):
    """Get a specific user by ID. Admin only."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return _build_user_admin_payload(user, db)


# â”€â”€ 4. Create User (Admin Only) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
@router.post("", response_model=UserAdminResponse, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_role("admin"))])
async def create_user(user_in: UserCreate, db: Session = Depends(get_db)):
    """Create a new user. Admin only."""
    requested_username = str(user_in.username or "").strip()
    role_key = _normalize_text_key(user_in.role)
    if not requested_username and role_key != "student":
        raise HTTPException(status_code=400, detail="Username is required for non-student users")

    if not requested_username and role_key == "student":
        requested_username = _generate_student_username(
            db,
            admission_year=user_in.admission_year,
            college_value=user_in.college,
            level_value=user_in.level,
            student_code=user_in.student_code,
        )

    # Check uniqueness
    existing_user = db.query(User).filter(
        or_(
            User.email == user_in.email,
            User.username == requested_username,
        )
    ).first()
    
    if existing_user:
        raise HTTPException(
            status_code=400,
            detail="User with this email or username already exists"
        )

    if user_in.student_code:
        existing_student = db.query(User).filter(User.student_code == user_in.student_code).first()
        if existing_student:
            raise HTTPException(
                status_code=400,
                detail="User with this student_code already exists"
            )

    recovery_email = str(user_in.recovery_email or "").strip().lower()
    create_data = user_in.model_dump(exclude={"password", "recovery_email"})
    create_data["username"] = requested_username
    _sanitize_user_academic_fields(create_data, db)
    if _normalize_text_key(create_data.get("role")) == "student":
        create_data["theme_preference"] = "light"

    # Hash password safely
    db_user = User(**create_data)
    db_user.password_hash = hash_password(user_in.password)
    db_user.password_history_json = json.dumps([db_user.password_hash], ensure_ascii=False)
    # For students created by admin, enforce first-login password change.
    if _normalize_text_key(db_user.role) == "student":
        db_user.must_change_password = True
        db_user.password_changed_at = None
    else:
        db_user.must_change_password = False
        db_user.password_changed_at = datetime.now(timezone.utc)

    db.add(db_user)
    db.commit()
    db.refresh(db_user)

    if recovery_email:
        contact_row = db.query(UserContactSettings).filter(UserContactSettings.user_id == db_user.id).first()
        if not contact_row:
            contact_row = UserContactSettings(user_id=db_user.id)
            db.add(contact_row)
        contact_row.display_name = contact_row.display_name or db_user.full_name
        contact_row.recovery_email = recovery_email
        db.commit()

    # Send initial credentials email for students when SMTP is configured.
    if _normalize_text_key(user_in.role) == "student":
        target_email = str(recovery_email or db_user.email or "").strip().lower()
        try:
            await _send_account_credentials_email(
                email=target_email,
                username=str(db_user.username or "").strip(),
                temp_password=str(user_in.password or "").strip(),
            )
        except Exception as exc:
            # Keep user creation successful even if email sending fails.
            print(f"Credentials email send failed for {target_email or db_user.email}: {exc}")

    return _build_user_admin_payload(db_user, db)


# â”€â”€ 5. Update User (Admin Only) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
@router.patch("/{user_id}", response_model=UserAdminResponse, dependencies=[Depends(require_role("admin"))])
async def update_user(user_id: int, user_in: UserUpdate, db: Session = Depends(get_db)):
    """Update a user. Admin only."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    update_data = user_in.model_dump(exclude_unset=True)
    recovery_email = None
    if "recovery_email" in update_data:
        recovery_email = str(update_data.pop("recovery_email") or "").strip().lower() or None

    if "password" in update_data:
        hashed_password = hash_password(update_data["password"])
        del update_data["password"]
        update_data["password_hash"] = hashed_password
        update_data["password_history_json"] = json.dumps([hashed_password], ensure_ascii=False)
        target_role = _normalize_text_key(update_data.get("role", user.role))
        if target_role == "student":
            update_data["must_change_password"] = True
            update_data["password_changed_at"] = None
        else:
            update_data["must_change_password"] = False
            update_data["password_changed_at"] = datetime.now(timezone.utc)

    merged_preview = {
        "role": update_data.get("role", user.role),
        "student_code": update_data.get("student_code", user.student_code),
        "admission_year": update_data.get("admission_year", user.admission_year),
        "college": update_data.get("college", user.college),
        "major": update_data.get("major", user.major),
        "level": update_data.get("level", user.level),
    }
    _sanitize_user_academic_fields(merged_preview, db)
    update_data["student_code"] = merged_preview.get("student_code")
    update_data["admission_year"] = merged_preview.get("admission_year")
    update_data["college"] = merged_preview.get("college")
    update_data["major"] = merged_preview.get("major")
    update_data["level"] = merged_preview.get("level")

    for field, value in update_data.items():
        setattr(user, field, value)

    db.add(user)
    db.commit()

    if recovery_email is not None:
        contact_row = db.query(UserContactSettings).filter(UserContactSettings.user_id == user.id).first()
        if not contact_row:
            contact_row = UserContactSettings(user_id=user.id)
            db.add(contact_row)
        contact_row.display_name = contact_row.display_name or user.full_name
        contact_row.recovery_email = recovery_email
        db.commit()

    db.refresh(user)

    target_email = recovery_email
    if target_email is None:
        contact_row = db.query(UserContactSettings).filter(UserContactSettings.user_id == user.id).first()
        target_email = contact_row.recovery_email if contact_row and contact_row.recovery_email else None

    if target_email:
        try:
            await _send_account_update_email(
                email=str(target_email).strip().lower(),
                username=str(user.username or "").strip(),
                university_email=str(user.email or "").strip(),
                temp_password=str(user_in.password or "").strip() or None,
            )
        except Exception as exc:
            print(f"Account update email send failed for {target_email}: {exc}")

    return _build_user_admin_payload(user, db)


# â”€â”€ 6. Delete User (Admin Only) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_role("admin"))])
async def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a user. Admin only."""
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own admin account")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # NOTE:
    # Some legacy tables reference users without ON DELETE CASCADE.
    # We clean references first to avoid FK violations on SQLite.
    from models.conversation import Conversation, Message
    from models.conversation_rating import ConversationRating
    from models.quiz import Quiz, QuizSubmission
    from models.feedback import Feedback
    from models.content import ContentPost
    from models.storage import StorageItem
    from models.chatbot import ChatbotSession

    try:
        # Keep historical messages but detach deleted sender identity.
        db.query(Message).filter(Message.sender_user_id == user_id).update({Message.sender_user_id: None}, synchronize_session=False)

        # If deleted user is/was an admin, detach assignments/reviewer references.
        db.query(Conversation).filter(Conversation.assigned_admin_id == user_id).update({Conversation.assigned_admin_id: None}, synchronize_session=False)
        db.query(UserProfilePhoto).filter(UserProfilePhoto.reviewed_by == user_id).update({UserProfilePhoto.reviewed_by: None}, synchronize_session=False)
        db.query(Quiz).filter(Quiz.created_by == user_id).update({Quiz.created_by: None}, synchronize_session=False)
        db.query(Feedback).filter(Feedback.user_id == user_id).update({Feedback.user_id: None}, synchronize_session=False)
        db.query(StorageItem).filter(StorageItem.owner_id == user_id).update({StorageItem.owner_id: None}, synchronize_session=False)

        # Delete rows owned by this user where FK is required (cannot be NULL).
        db.query(ContentPost).filter(ContentPost.author_id == user_id).delete(synchronize_session=False)
        db.query(QuizSubmission).filter(QuizSubmission.student_id == user_id).delete(synchronize_session=False)
        db.query(ConversationRating).filter(ConversationRating.student_id == user_id).delete(synchronize_session=False)
        db.query(ChatbotSession).filter(ChatbotSession.student_id == user_id).delete(synchronize_session=False)
        db.query(Conversation).filter(Conversation.student_id == user_id).delete(synchronize_session=False)

        db.delete(user)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Cannot delete user because related records still exist. Please archive or remove linked data first.",
        )
    return None


@router.get("/requests/account-requests", response_model=List[AccountRequestItem], dependencies=[Depends(require_role("admin"))])
async def list_account_requests(
    status_filter: str = Query(default="pending", alias="status"),
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    allowed = {"all", "pending", "approved", "rejected"}
    if status_filter not in allowed:
        raise HTTPException(status_code=400, detail=f"Invalid status. Allowed: {', '.join(sorted(allowed))}")

    query = db.query(AccountRequest)
    if status_filter != "all":
        query = query.filter(AccountRequest.status == status_filter)

    return query.order_by(AccountRequest.created_at.desc()).offset(skip).limit(limit).all()


@router.post("/requests/account-requests/{request_id}/review", dependencies=[Depends(require_role("admin"))])
async def review_account_request(
    request_id: int,
    body: AccountRequestReview,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    row = db.query(AccountRequest).filter(AccountRequest.id == request_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Account request not found")

    if row.status != "pending":
        raise HTTPException(status_code=400, detail="Only pending requests can be reviewed")

    action = str(body.action or "").strip().lower()
    if action == "reject":
        row.status = "rejected"
        row.review_note = (body.review_note or "").strip() or None
        row.reviewed_by_user_id = current_user.id
        row.reviewed_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(row)
        return {"message": "Request rejected successfully", "request_id": row.id, "status": row.status}

    existing = db.query(User).filter(or_(User.email == row.email, User.national_id == row.national_id)).first()
    if existing:
        raise HTTPException(status_code=400, detail="A user already exists for this email or national ID")

    start_year = _current_academic_start_year(datetime.now(timezone.utc))
    admission_year = f"{start_year}-{start_year + 1}"

    username = _generate_student_username(
        db,
        admission_year=admission_year,
        college_value=row.college,
        level_value=row.level,
        student_code=None,
    )
    student_code = _generate_student_code(db, college_value=row.college, level_value=row.level)
    temp_password = _generate_temp_password(10)

    create_data = {
        "username": username,
        "email": row.email,
        "full_name": row.full_name,
        "role": "student",
        "student_code": student_code,
        "admission_year": admission_year,
        "college": row.college,
        "major": None,
        "level": row.level,
        "national_id": row.national_id,
        "nationality": "Egypt",
        "gender": None,
        "birth_place": None,
        "theme_preference": "light",
    }
    _sanitize_user_academic_fields(create_data, db)

    db_user = User(**create_data)
    db_user.password_hash = hash_password(temp_password)
    db_user.password_history_json = json.dumps([db_user.password_hash], ensure_ascii=False)
    db_user.must_change_password = True
    db_user.password_changed_at = None
    db.add(db_user)

    row.status = "approved"
    row.review_note = (body.review_note or "").strip() or None
    row.reviewed_by_user_id = current_user.id
    row.reviewed_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(row)
    db.refresh(db_user)

    email_sent = True
    try:
        email_result = await _send_account_credentials_email(
            email=str(db_user.email or "").strip(),
            username=str(db_user.username or "").strip(),
            temp_password=temp_password,
        )
        email_sent = bool(email_result.email_sent)
    except Exception as exc:
        email_sent = False
        print(f"Credentials email send failed for {db_user.email}: {exc}")

    response = {
        "message": "Request approved and account created successfully",
        "request_id": row.id,
        "status": row.status,
        "user_id": db_user.id,
        "username": db_user.username,
        "student_code": db_user.student_code,
        "email_sent": email_sent,
    }
    if not email_sent:
        response["temp_password"] = temp_password
    return response

