"""
Security utilities: JWT token creation/verification and password hashing.

Uses PyJWT for tokens and bcrypt for password hashing/verification.
Passlib is kept as a primary path, but we gracefully fall back to direct
bcrypt checks when passlib backend issues occur in some environments.
"""

from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
import bcrypt
from passlib.context import CryptContext

from core.config import get_settings

settings = get_settings()

# ── Password Hashing ─────────────────────────────────────────────────
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(plain_password: str) -> str:
    """Hash a plain-text password using bcrypt."""
    # Prefer passlib for consistency with existing data.
    try:
        return pwd_context.hash(plain_password)
    except Exception:
        salt = bcrypt.gensalt(rounds=12)
        return bcrypt.hashpw(plain_password.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain-text password against a bcrypt hash."""
    try:
        return pwd_context.verify(plain_password, hashed_password)
    except Exception:
        # Fallback for environments where passlib backend wiring fails.
        try:
            return bcrypt.checkpw(
                plain_password.encode("utf-8"),
                hashed_password.encode("utf-8"),
            )
        except Exception:
            return False


# ── JWT Tokens ────────────────────────────────────────────────────────
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """
    Create a signed JWT token.

    Args:
        data: Payload dict. Must include "sub" (subject = user id).
        expires_delta: Optional custom expiry. Defaults to config value.

    Returns:
        Encoded JWT string.
    """
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire, "iat": datetime.now(timezone.utc)})
    return jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> Optional[dict]:
    """
    Decode and verify a JWT token.

    Returns:
        Decoded payload dict, or None if invalid/expired.
    """
    try:
        return jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except jwt.PyJWTError:
        return None
