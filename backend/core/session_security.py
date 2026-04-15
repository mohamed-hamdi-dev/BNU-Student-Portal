from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Request
from sqlalchemy import or_
from sqlalchemy.orm import Session

from core.config import get_settings
from models.auth_security import LoginAttempt, UserSession

settings = get_settings()


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def to_utc_datetime(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def get_request_ip(request: Optional[Request]) -> str:
    if request is None:
        return "unknown"
    forwarded = str(request.headers.get("x-forwarded-for", "")).strip()
    if forwarded:
        candidate = forwarded.split(",")[0].strip()
        if candidate:
            return candidate[:64]
    real_ip = str(request.headers.get("x-real-ip", "")).strip()
    if real_ip:
        return real_ip[:64]
    if request.client and request.client.host:
        return str(request.client.host).strip()[:64] or "unknown"
    return "unknown"


def get_request_user_agent(request: Optional[Request]) -> str:
    if request is None:
        return ""
    return str(request.headers.get("user-agent", "")).strip()[:255]


def _idle_cutoff(now: datetime) -> datetime:
    timeout_minutes = max(1, int(settings.SESSION_IDLE_TIMEOUT_MINUTES or 15))
    return now - timedelta(minutes=timeout_minutes)


def cleanup_expired_sessions(db: Session, user_id: int | None = None) -> None:
    now = utc_now()
    cutoff = _idle_cutoff(now)
    query = db.query(UserSession).filter(UserSession.is_active.is_(True))
    if user_id is not None:
        query = query.filter(UserSession.user_id == int(user_id))

    expired_rows = query.filter(
        or_(UserSession.expires_at <= now, UserSession.last_seen_at < cutoff)
    ).all()
    changed = False
    for row in expired_rows:
        row.is_active = False
        row.ended_at = now
        row.revoked_reason = "absolute_timeout" if to_utc_datetime(row.expires_at) and to_utc_datetime(row.expires_at) <= now else "idle_timeout"
        changed = True
    if changed:
        db.commit()


def create_user_session(db: Session, user_id: int, ip_address: str, user_agent: str) -> UserSession:
    now = utc_now()
    cleanup_expired_sessions(db, user_id=user_id)

    max_sessions = max(1, int(settings.MAX_ACTIVE_SESSIONS_PER_USER or 2))
    active_sessions = (
        db.query(UserSession)
        .filter(UserSession.user_id == int(user_id), UserSession.is_active.is_(True))
        .order_by(UserSession.created_at.asc())
        .all()
    )
    if len(active_sessions) >= max_sessions:
        sessions_to_revoke = len(active_sessions) - max_sessions + 1
        for old in active_sessions[:sessions_to_revoke]:
            old.is_active = False
            old.ended_at = now
            old.revoked_reason = "max_sessions"

    absolute_timeout_hours = max(1, int(settings.SESSION_ABSOLUTE_TIMEOUT_HOURS or 8))
    row = UserSession(
        session_id=secrets.token_urlsafe(32),
        user_id=int(user_id),
        ip_address=str(ip_address or "")[:64] or None,
        user_agent=str(user_agent or "")[:255] or None,
        is_active=True,
        created_at=now,
        last_seen_at=now,
        expires_at=now + timedelta(hours=absolute_timeout_hours),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def validate_and_touch_user_session(db: Session, user_id: int, session_id: str) -> tuple[bool, str | None]:
    now = utc_now()
    row = (
        db.query(UserSession)
        .filter(
            UserSession.user_id == int(user_id),
            UserSession.session_id == str(session_id or "").strip(),
            UserSession.is_active.is_(True),
        )
        .first()
    )
    if row is None:
        return False, "انتهت الجلسة. يرجى تسجيل الدخول مرة أخرى."

    expires_at = to_utc_datetime(row.expires_at)
    last_seen_at = to_utc_datetime(row.last_seen_at)
    if expires_at is not None and expires_at <= now:
        row.is_active = False
        row.ended_at = now
        row.revoked_reason = "absolute_timeout"
        db.commit()
        return False, "انتهت الجلسة (8 ساعات). يرجى تسجيل الدخول مرة أخرى."

    idle_timeout_minutes = max(1, int(settings.SESSION_IDLE_TIMEOUT_MINUTES or 15))
    if last_seen_at is not None and last_seen_at + timedelta(minutes=idle_timeout_minutes) <= now:
        row.is_active = False
        row.ended_at = now
        row.revoked_reason = "idle_timeout"
        db.commit()
        return False, "انتهت الجلسة بسبب عدم النشاط. يرجى تسجيل الدخول مرة أخرى."

    touch_interval_seconds = max(5, int(settings.SESSION_TOUCH_INTERVAL_SECONDS or 45))
    if last_seen_at is None or (now - last_seen_at).total_seconds() >= touch_interval_seconds:
        row.last_seen_at = now
        db.commit()
    return True, None


def normalize_login_key(username: str) -> str:
    return str(username or "").strip().lower()


def check_login_lockout(db: Session, username_key: str, ip_address: str) -> tuple[bool, int]:
    now = utc_now()
    row = (
        db.query(LoginAttempt)
        .filter(
            LoginAttempt.username_key == str(username_key or "").strip(),
            LoginAttempt.ip_address == str(ip_address or "").strip(),
        )
        .first()
    )
    if row is None:
        return False, 0

    window_minutes = max(1, int(settings.LOGIN_RATE_LIMIT_WINDOW_MINUTES or 15))
    window_started = to_utc_datetime(row.window_started_at) or now
    if now - window_started >= timedelta(minutes=window_minutes):
        row.failed_count = 0
        row.window_started_at = now
        row.locked_until = None
        db.commit()
        return False, 0

    locked_until = to_utc_datetime(row.locked_until)
    if locked_until and locked_until > now:
        return True, int((locked_until - now).total_seconds())
    return False, 0


def register_login_failure(db: Session, username_key: str, ip_address: str) -> tuple[bool, int]:
    now = utc_now()
    safe_key = str(username_key or "").strip()
    safe_ip = str(ip_address or "").strip()
    row = (
        db.query(LoginAttempt)
        .filter(LoginAttempt.username_key == safe_key, LoginAttempt.ip_address == safe_ip)
        .first()
    )
    if row is None:
        row = LoginAttempt(
            username_key=safe_key,
            ip_address=safe_ip,
            failed_count=0,
            window_started_at=now,
        )
        db.add(row)

    window_minutes = max(1, int(settings.LOGIN_RATE_LIMIT_WINDOW_MINUTES or 15))
    if now - (to_utc_datetime(row.window_started_at) or now) >= timedelta(minutes=window_minutes):
        row.failed_count = 0
        row.window_started_at = now
        row.locked_until = None

    row.failed_count = int(row.failed_count or 0) + 1
    row.last_failed_at = now

    max_attempts = max(1, int(settings.LOGIN_RATE_LIMIT_MAX_ATTEMPTS or 5))
    if row.failed_count >= max_attempts:
        lock_minutes = max(1, int(settings.LOGIN_LOCKOUT_MINUTES or 15))
        row.locked_until = now + timedelta(minutes=lock_minutes)
        db.commit()
        return True, lock_minutes * 60

    db.commit()
    return False, 0


def clear_login_failures(db: Session, username_key: str, ip_address: str) -> None:
    row = (
        db.query(LoginAttempt)
        .filter(
            LoginAttempt.username_key == str(username_key or "").strip(),
            LoginAttempt.ip_address == str(ip_address or "").strip(),
        )
        .first()
    )
    if row is not None:
        db.delete(row)
        db.commit()
