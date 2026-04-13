import hashlib
import json
import os
import secrets
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Optional

from fastapi import APIRouter, HTTPException
from fastapi_mail import ConnectionConfig, FastMail, MessageSchema
from dotenv import load_dotenv
from pydantic import BaseModel, EmailStr, Field


OTP_TTL_SECONDS = 5 * 60
OTP_MAX_ATTEMPTS = 5


def _get_user_db_path() -> Path:
    # Default points to the React app's json "db" used in this workspace.
    default = Path(__file__).resolve().parent / ".." / ".." / "BNU-Student-Portal" / "Data" / "db.json"
    return Path(os.getenv("USER_DB_PATH", str(default))).resolve()


def _find_user_email(email: str) -> Optional[str]:
    db_path = _get_user_db_path()
    try:
        raw = db_path.read_text(encoding="utf-8")
        # Handle BOM if present
        raw = raw.lstrip("\ufeff")
        data = json.loads(raw)
        users = data.get("users", [])
        for user in users:
            user_email = (user.get("email") or "").strip()
            if user_email.lower() == email.lower():
                return user_email
        return None
    except FileNotFoundError:
        raise HTTPException(status_code=500, detail="User database not found")
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to read user database")


def _otp_secret() -> str:
    # Optional salt to avoid storing raw OTP in memory.
    return os.getenv("OTP_SECRET", "")


def _hash_otp(email: str, otp: str) -> str:
    material = f"{email.lower()}|{otp}|{_otp_secret()}".encode("utf-8")
    return hashlib.sha256(material).hexdigest()


def _generate_otp() -> str:
    # 6-digit numeric OTP (000000-999999) with leading zeros.
    return f"{secrets.randbelow(1_000_000):06d}"


@dataclass
class OtpRecord:
    otp_hash: str
    expires_at: float
    attempts: int


_otp_store: Dict[str, OtpRecord] = {}

# Ensure env is loaded even if server started from a different cwd.
_ENV_PATH = Path(__file__).resolve().parent / ".env"
load_dotenv(_ENV_PATH)


def _mail_config() -> ConnectionConfig:
    username = os.getenv("MAIL_USERNAME", "")
    password = os.getenv("MAIL_PASSWORD", "")
    server = os.getenv("MAIL_SERVER", "smtp.gmail.com")
    port = int(os.getenv("MAIL_PORT", "587"))

    if not username or not password:
        raise HTTPException(status_code=503, detail="OTP service unavailable")

    return ConnectionConfig(
        MAIL_USERNAME=username,
        MAIL_PASSWORD=password,
        MAIL_FROM=username,
        MAIL_SERVER=server,
        MAIL_PORT=port,
        MAIL_STARTTLS=True,
        MAIL_SSL_TLS=False,
        USE_CREDENTIALS=True,
        VALIDATE_CERTS=True,
    )


async def _send_otp_email(email: str, otp: str) -> None:
    conf = _mail_config()
    fm = FastMail(conf)
    message = MessageSchema(
        subject="Your OTP Code",
        recipients=[email],
        body=f"Your verification code is: {otp}\n\nThis code expires in 5 minutes.",
        subtype="plain",
    )
    await fm.send_message(message)


class RequestOtpBody(BaseModel):
    email: EmailStr


class VerifyOtpBody(BaseModel):
    email: EmailStr
    otp: str = Field(..., min_length=6, max_length=6, pattern=r"^\d{6}$")


router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/request-otp")
async def request_otp(body: RequestOtpBody):
    email = str(body.email).lower()

    # Always return a generic success message to avoid leaking which emails exist.
    stored_email = _find_user_email(email)
    if not stored_email:
        return {"message": "If the email is registered, an OTP will be sent"}

    otp = _generate_otp()
    _otp_store[email] = OtpRecord(
        otp_hash=_hash_otp(email, otp),
        expires_at=time.time() + OTP_TTL_SECONDS,
        attempts=0,
    )

    try:
        await _send_otp_email(stored_email, otp)
    except HTTPException:
        # Raised by config issues, already safe/generic.
        _otp_store.pop(email, None)
        raise
    except Exception as exc:
        # Avoid exposing provider details to the frontend.
        _otp_store.pop(email, None)
        print(f"OTP email send failed for {email}: {exc}")
        raise HTTPException(status_code=503, detail="OTP service unavailable")

    return {"message": "If the email is registered, an OTP will be sent"}


@router.post("/verify-otp")
async def verify_otp(body: VerifyOtpBody):
    email = str(body.email).lower()
    record: Optional[OtpRecord] = _otp_store.get(email)

    if not record:
        raise HTTPException(status_code=400, detail="OTP not requested")

    if time.time() > record.expires_at:
        _otp_store.pop(email, None)
        raise HTTPException(status_code=400, detail="OTP expired")

    if record.attempts >= OTP_MAX_ATTEMPTS:
        _otp_store.pop(email, None)
        raise HTTPException(status_code=400, detail="Too many attempts")

    if _hash_otp(email, body.otp) != record.otp_hash:
        record.attempts += 1
        _otp_store[email] = record
        raise HTTPException(status_code=400, detail="Invalid OTP")

    _otp_store.pop(email, None)
    return {"verified": True}
