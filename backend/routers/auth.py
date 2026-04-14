"""
Authentication and OTP router.
Handles login (JWT issuance), OTP generation, and password resets.
"""

from datetime import datetime, timedelta, timezone
import json
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import or_
from sqlalchemy import text
from sqlalchemy import inspect

from core.email import send_email
from core.security import verify_password, create_access_token, hash_password
from core.deps import get_db, get_current_user
from core.config import get_settings
from models.user import User
from models.account_request import AccountRequest
from models.otp import OTPRequest as OTPModel
from models.user_contact import UserContactSettings
from schemas.auth import LoginRequest, Token, OTPRequest, OTPVerify, ResetPassword, ChangePassword, AccountRequestCreate
from schemas.user import UserProfileResponse

import secrets

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()


def ensure_auth_security_schema(db: Session) -> None:
    """
    Backfill auth-critical columns for legacy/migrated databases.
    This prevents login 500s when `users` exists with older schema.
    """
    bind = db.get_bind()
    if bind is None:
        return None

    dialect = str(bind.dialect.name or "").lower()
    inspector = inspect(bind)
    try:
        existing = {col["name"] for col in inspector.get_columns("users")}
    except Exception:
        return None

    # Columns required by the current User ORM model.
    # Keep SQL generic enough for PostgreSQL + SQLite.
    required_columns = {
        "student_code": "VARCHAR(50)",
        "admission_year": "VARCHAR(20)",
        "college": "VARCHAR(100)",
        "major": "VARCHAR(100)",
        "level": "VARCHAR(20)",
        "national_id": "VARCHAR(50)",
        "nationality": "VARCHAR(50)",
        "gender": "VARCHAR(10)",
        "birth_place": "VARCHAR(100)",
        "is_active": "BOOLEAN NOT NULL DEFAULT TRUE",
        "theme_preference": "VARCHAR(10) NOT NULL DEFAULT 'system'",
        "avatar_size_px": "INTEGER NOT NULL DEFAULT 48",
        "must_change_password": "BOOLEAN NOT NULL DEFAULT FALSE",
        "password_changed_at": "TIMESTAMP",
        "password_history_json": "TEXT NOT NULL DEFAULT '[]'",
        "created_at": "TIMESTAMP",
        "updated_at": "TIMESTAMP",
    }

    statements: list[str] = []
    for col, ddl in required_columns.items():
        if col in existing:
            continue
        if dialect == "postgresql":
            statements.append(f"ALTER TABLE users ADD COLUMN IF NOT EXISTS {col} {ddl}")
        else:
            statements.append(f"ALTER TABLE users ADD COLUMN {col} {ddl}")

    if not statements:
        return None

    for stmt in statements:
        try:
            db.execute(text(stmt))
        except Exception:
            # Ignore duplicate/add errors to keep login resilient.
            db.rollback()

    # Fill nullable timestamps for stricter response schema expectations.
    try:
        db.execute(text("UPDATE users SET created_at = NOW() WHERE created_at IS NULL"))
    except Exception:
        db.rollback()
    try:
        db.execute(text("UPDATE users SET updated_at = NOW() WHERE updated_at IS NULL"))
    except Exception:
        db.rollback()
    try:
        db.execute(text("UPDATE users SET password_history_json = '[]' WHERE password_history_json IS NULL"))
    except Exception:
        db.rollback()

    try:
        db.commit()
    except Exception:
        db.rollback()
    return None


def _normalize_role_value(value: str | None) -> str:
    raw = str(value or "").strip().lower()
    if raw in {"admin", "student", "doctor", "advisor"}:
        return raw
    if raw in {"طالب", "student"}:
        return "student"
    if raw in {"دكتور", "doctor", "instructor"}:
        return "doctor"
    if raw in {"مرشد", "advisor", "adviser"}:
        return "advisor"
    if raw in {"ادمن", "مشرف", "admin"}:
        return "admin"
    return "student"


def _normalize_theme_value(value: str | None) -> str:
    raw = str(value or "").strip().lower()
    if raw in {"light", "dark", "system"}:
        return raw
    return "system"


def _safe_user_profile_payload(user: User) -> dict:
    now_utc = datetime.now(timezone.utc)
    created_at = _to_utc_datetime(getattr(user, "created_at", None)) or now_utc
    updated_at = _to_utc_datetime(getattr(user, "updated_at", None)) or now_utc
    payload = {
        "id": int(getattr(user, "id") or 0),
        "username": str(getattr(user, "username", "") or ""),
        "email": str(getattr(user, "email", "") or ""),
        "full_name": str(getattr(user, "full_name", "") or ""),
        "role": _normalize_role_value(getattr(user, "role", None)),
        "student_code": getattr(user, "student_code", None),
        "admission_year": getattr(user, "admission_year", None),
        "college": getattr(user, "college", None),
        "major": getattr(user, "major", None),
        "level": getattr(user, "level", None),
        "theme_preference": _normalize_theme_value(getattr(user, "theme_preference", None)),
        "avatar_size_px": int(getattr(user, "avatar_size_px", 48) or 48),
        "nationality": getattr(user, "nationality", None),
        "gender": getattr(user, "gender", None),
        "birth_place": getattr(user, "birth_place", None),
        "is_active": bool(getattr(user, "is_active", True)),
        "national_id": getattr(user, "national_id", None),
        "must_change_password": bool(getattr(user, "must_change_password", False)),
        "password_changed_at": _to_utc_datetime(getattr(user, "password_changed_at", None)),
        "password_expires_at": None,
        "password_expired": False,
        "created_at": created_at,
        "updated_at": updated_at,
    }
    try:
        return UserProfileResponse.model_validate(payload).model_dump(mode="json")
    except Exception:
        return payload


def _load_password_history(user: User) -> list[str]:
    raw = str(getattr(user, "password_history_json", "") or "").strip()
    if not raw:
        return []
    try:
        data = json.loads(raw)
        if isinstance(data, list):
            return [str(item) for item in data if str(item or "").strip()]
    except Exception:
        pass
    return []


def _save_password_history(user: User, history: list[str]) -> None:
    limit = max(1, int(settings.PASSWORD_HISTORY_LIMIT or 3))
    user.password_history_json = json.dumps(history[:limit], ensure_ascii=False)


def _to_utc_datetime(value):
    if not value:
        return None
    if not isinstance(value, datetime):
        return None
    # SQLite may return naive datetimes even for timezone=True columns.
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _is_password_expired(user: User) -> bool:
    max_age_days = int(settings.PASSWORD_MAX_AGE_DAYS or 0)
    if max_age_days <= 0:
        return False
    changed_at = _to_utc_datetime(getattr(user, "password_changed_at", None))
    if not changed_at:
        return True
    expiry = changed_at + timedelta(days=max_age_days)
    return datetime.now(timezone.utc) >= expiry


def _password_expires_at(user: User):
    max_age_days = int(settings.PASSWORD_MAX_AGE_DAYS or 0)
    changed_at = _to_utc_datetime(getattr(user, "password_changed_at", None))
    if max_age_days <= 0 or not changed_at:
        return None
    return changed_at + timedelta(days=max_age_days)


# ── Internal OTP Email helper (Placeholder for now) ───────────────────
async def _send_otp_email(email: str, otp: str) -> None:
    send_email(
        email,
        "BNU Portal - OTP Verification Code",
        (
            f"Your OTP code is: {otp}\n\n"
            f"This code will expire in {max(1, settings.OTP_TTL_SECONDS // 60)} minutes."
        ),
    )


def _digits_only(value: str) -> str:
    mapped = str(value or "").translate(str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789"))
    return "".join(ch for ch in mapped if ch.isdigit())


def _to_year_no(value: str) -> int:
    digits = _digits_only(value)
    if digits:
        return int(digits)
    txt = str(value or "").strip().lower()
    mapping = {
        "first": 1,
        "second": 2,
        "third": 3,
        "fourth": 4,
        "الفرقة الأولى": 1,
        "الفرقة الاولى": 1,
        "الفرقة الثانية": 2,
        "الفرقة الثالثة": 3,
        "الفرقة الرابعة": 4,
    }
    for key, val in mapping.items():
        if key in txt:
            return val
    return 0


def _college_code(college: str) -> str:
    normalized = str(college or "").strip().lower()
    if "computer" in normalized or "حاسب" in normalized:
        return "03"
    if "engineer" in normalized or "هندس" in normalized:
        return "02"
    if "business" in normalized or "ادارة" in normalized:
        return "04"
    if "medicine" in normalized or "طب" in normalized:
        return "05"
    if "dent" in normalized or "اسنان" in normalized:
        return "06"
    if "pharm" in normalized or "صيدل" in normalized:
        return "07"
    return "99"


def _generate_temp_password(length: int = 10) -> str:
    chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%"
    return "".join(secrets.choice(chars) for _ in range(length))


def _send_student_credentials_email(email: str, username: str, password: str) -> None:
    send_email(
        email,
        "BNU Portal - Account Credentials",
        (
            "Your account has been created in BNU Portal.\n\n"
            f"Username: {username}\n"
            f"Temporary Password: {password}\n\n"
            "Please change your password after your first login."
        ),
    )


# ── 1. Login (JWT) ────────────────────────────────────────────────────
@router.post("/login", response_model=Token)
async def login(request: LoginRequest, db: Session = Depends(get_db)):
    """Authenticate user and return a JWT token with profile data."""
    ensure_auth_security_schema(db)

    user = db.query(User).filter(
        or_(
            User.username == request.username,
            User.email == request.username,
            User.student_code == request.username,
        )
    ).first()

    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect username or password")

    if not verify_password(request.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect username or password")

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User account is deactivated")

    must_change_password = bool(getattr(user, "must_change_password", False))
    password_expired = bool(_is_password_expired(user))
    must_change_effective = bool(must_change_password or password_expired)

    access_token_expires = timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)
    token = create_access_token(data={"sub": str(user.id)}, expires_delta=access_token_expires)
    safe_user = _safe_user_profile_payload(user)

    try:
        contact_settings = db.query(UserContactSettings).filter(UserContactSettings.user_id == user.id).first()
    except Exception:
        db.rollback()
        contact_settings = None

    resolved_display_name = contact_settings.display_name if contact_settings and contact_settings.display_name else user.full_name
    resolved_recovery_email = contact_settings.recovery_email if contact_settings and contact_settings.recovery_email else user.email
    resolved_phone = contact_settings.phone_number if contact_settings else None
    safe_user["display_name"] = resolved_display_name
    safe_user["displayName"] = resolved_display_name
    safe_user["recovery_email"] = resolved_recovery_email
    safe_user["phone_number"] = resolved_phone
    safe_user["must_change_password"] = must_change_effective
    safe_user["password_expired"] = password_expired
    safe_user["password_expires_at"] = _password_expires_at(user)
    safe_user["password_policy_days"] = int(settings.PASSWORD_MAX_AGE_DAYS or 0)

    return Token(access_token=token, token_type="bearer", user=safe_user)


# ── 2. Request OTP (Forgot Password) ──────────────────────────────────
@router.post("/forgot-password")
async def request_otp(body: OTPRequest, db: Session = Depends(get_db)):
    """Generate and send an OTP to the user's registered email."""
    submitted_aff_no = str(body.student_code or "").strip()
    submitted_national_id = str(body.national_id or "").strip()
    submitted_email = str(body.email or "").strip().lower()
    if not submitted_aff_no or not submitted_national_id:
        raise HTTPException(status_code=400, detail="Invalid recovery data")

    user = db.query(User).filter(User.national_id == submitted_national_id).filter(
        or_(
            User.username == submitted_aff_no,
            User.student_code == submitted_aff_no,
        )
    ).first()
    if not user:
        raise HTTPException(status_code=400, detail="Invalid recovery data")

    user_contact = db.query(UserContactSettings).filter(UserContactSettings.user_id == user.id).first()
    recovery_email = str((user_contact.recovery_email if user_contact and user_contact.recovery_email else user.email) or "").strip().lower()
    if not recovery_email or submitted_email != recovery_email:
        raise HTTPException(status_code=400, detail="Invalid recovery data")

    otp_code = f"{secrets.randbelow(1_000_000):06d}"
    material = f"{recovery_email}|{otp_code}|{settings.OTP_SECRET}".encode("utf-8")
    import hashlib
    otp_hash = hashlib.sha256(material).hexdigest()

    expiry = datetime.now(timezone.utc) + timedelta(seconds=settings.OTP_TTL_SECONDS)
    db_otp = OTPModel(
        user_id=user.id,
        otp_hash=otp_hash,
        purpose="password_reset",
        expires_at=expiry,
    )
    db.add(db_otp)
    db.commit()
    db.refresh(db_otp)

    try:
        await _send_otp_email(recovery_email, otp_code)
    except HTTPException:
        raise
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="OTP email delivery failed") from exc

    response = {
        "message": "If the email is registered, an OTP will be sent",
        "request_id": str(db_otp.id),
        "expires_in_sec": settings.OTP_TTL_SECONDS,
    }
    return response


# ── 3. Verify OTP ─────────────────────────────────────────────────────
@router.post("/verify-otp")
async def verify_otp(body: OTPVerify, db: Session = Depends(get_db)):
    """Check if the provided OTP is valid and unexpired."""
    try:
        req_id = int(body.request_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid request ID")

    record = db.query(OTPModel).filter(OTPModel.id == req_id).first()
    if not record or record.is_used:
        raise HTTPException(status_code=400, detail="Invalid or used request ID")

    user = db.query(User).filter(User.id == record.user_id).first()
    if not user:
        raise HTTPException(status_code=400, detail="User not found")

    if datetime.now(timezone.utc) > record.expires_at:
        raise HTTPException(status_code=400, detail="OTP expired")

    if record.attempts >= settings.OTP_MAX_ATTEMPTS:
        raise HTTPException(status_code=400, detail="Too many attempts")

    user_contact = db.query(UserContactSettings).filter(UserContactSettings.user_id == user.id).first()
    email = str((user_contact.recovery_email if user_contact and user_contact.recovery_email else user.email) or "").lower()
    material = f"{email}|{body.otp}|{settings.OTP_SECRET}".encode("utf-8")
    import hashlib
    computed_hash = hashlib.sha256(material).hexdigest()

    if computed_hash != record.otp_hash:
        record.attempts += 1
        db.commit()
        raise HTTPException(status_code=400, detail="Invalid OTP")

    record.is_used = True
    db.commit()
    return {"verified": True}


# ── 4. Reset Password (with OTP) ──────────────────────────────────────
@router.post("/reset-password")
async def reset_password(body: ResetPassword, db: Session = Depends(get_db)):
    """Reset the password using a previously verified OTP request ID."""
    try:
        req_id = int(body.request_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid request ID")

    record = db.query(OTPModel).filter(OTPModel.id == req_id).first()
    if not record:
        raise HTTPException(status_code=400, detail="Invalid request ID")

    user = db.query(User).filter(User.id == record.user_id).first()
    if not user:
        raise HTTPException(status_code=400, detail="User not found")

    user_contact = db.query(UserContactSettings).filter(UserContactSettings.user_id == user.id).first()
    email = str((user_contact.recovery_email if user_contact and user_contact.recovery_email else user.email) or "").lower()
    material = f"{email}|{body.otp}|{settings.OTP_SECRET}".encode("utf-8")
    import hashlib
    computed_hash = hashlib.sha256(material).hexdigest()

    if computed_hash != record.otp_hash:
        raise HTTPException(status_code=400, detail="Invalid OTP")

    current_hash = str(user.password_hash or "")
    if verify_password(body.new_password, current_hash):
        raise HTTPException(status_code=400, detail="New password cannot be the same as current password")
    history = _load_password_history(user)
    if any(verify_password(body.new_password, old_hash) for old_hash in history):
        raise HTTPException(status_code=400, detail="New password was used recently")

    user.password_hash = hash_password(body.new_password)
    user.must_change_password = False
    user.password_changed_at = datetime.now(timezone.utc)
    _save_password_history(user, [user.password_hash, current_hash, *history])
    record.is_used = True
    db.commit()
    return {"message": "Password reset successfully"}


# ── 5. Change Password (Logged In) ────────────────────────────────────
@router.post("/change-password")
async def change_password(
    body: ChangePassword,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Change password for an authenticated user."""
    if not verify_password(body.current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Incorrect current password")

    if verify_password(body.new_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="New password cannot be the same as current password")

    history = _load_password_history(current_user)
    if any(verify_password(body.new_password, old_hash) for old_hash in history):
        raise HTTPException(status_code=400, detail="New password was used recently")

    previous_hash = str(current_user.password_hash or "")
    current_user.password_hash = hash_password(body.new_password)
    current_user.must_change_password = False
    current_user.password_changed_at = datetime.now(timezone.utc)
    _save_password_history(current_user, [current_user.password_hash, previous_hash, *history])
    db.commit()
    return {"message": "Password changed successfully"}


@router.post("/account-request")
async def create_account_request(body: AccountRequestCreate, db: Session = Depends(get_db)):
    full_name = str(body.full_name or "").strip()
    email = str(body.email or "").strip().lower()
    college = str(body.college or "").strip()
    level = str(body.level or "").strip()
    national_id_digits = _digits_only(body.national_id or "")

    if len(full_name.split()) < 4:
        raise HTTPException(status_code=400, detail="Full name must be 4 parts")
    if len(national_id_digits) != 14:
        raise HTTPException(status_code=400, detail="National ID must be 14 digits")

    existing = db.query(User).filter(or_(User.email == email, User.national_id == national_id_digits)).first()
    if existing:
        raise HTTPException(status_code=400, detail="Account already exists for this email or national ID")

    existing_pending = (
        db.query(AccountRequest)
        .filter(
            AccountRequest.status == "pending",
            or_(AccountRequest.email == email, AccountRequest.national_id == national_id_digits),
        )
        .first()
    )
    if existing_pending:
        raise HTTPException(status_code=400, detail="There is already a pending request for this email or national ID")

    request_row = AccountRequest(
        full_name=full_name,
        national_id=national_id_digits,
        college=college,
        level=level,
        email=email,
        status="pending",
    )
    db.add(request_row)
    db.commit()
    db.refresh(request_row)

    return {
        "message": "Account request submitted successfully and is pending admin review",
        "request_id": request_row.id,
        "status": request_row.status,
    }



