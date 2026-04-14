"""
Application configuration loaded from environment variables.

Reads from .env automatically. Swap DATABASE_URL to switch
between SQLite (dev) and PostgreSQL (production).
"""

import os
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv

_ENV_PATH = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(_ENV_PATH)


def _env_str(name: str, default: str = "") -> str:
    raw = os.getenv(name, default)
    value = str(raw if raw is not None else default).strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
        value = value[1:-1].strip()
    return value


def _env_int(name: str, default: int) -> int:
    raw = _env_str(name, str(default))
    return int(raw)


class Settings:
    """Central configuration sourced exclusively from environment variables."""

    # Local default:
    # sqlite:///.../backend/bnu_portal.db
    # Production example:
    # postgresql+psycopg://user:password@host:5432/dbname
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        f"sqlite:///{Path(__file__).resolve().parent.parent / 'bnu_portal.db'}",
    )

    JWT_SECRET_KEY: str = _env_str("JWT_SECRET_KEY", "CHANGE-ME-in-production-use-openssl-rand-hex-32")
    JWT_ALGORITHM: str = _env_str("JWT_ALGORITHM", "HS256")
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = _env_int("JWT_ACCESS_TOKEN_EXPIRE_MINUTES", 1440)

    CORS_ORIGINS: list[str] = [
        item.strip()
        for item in _env_str(
            "CORS_ORIGINS",
            "http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173",
        ).split(",")
        if item.strip()
    ]

    SMTP_HOST: str = _env_str("SMTP_HOST", "smtp.gmail.com")
    SMTP_PORT: int = _env_int("SMTP_PORT", 587)
    MAIL_USERNAME: str = _env_str("MAIL_USERNAME", "")
    MAIL_PASSWORD: str = _env_str("MAIL_PASSWORD", "")
    RESEND_API_KEY: str = _env_str("RESEND_API_KEY", "")
    RESEND_FROM_EMAIL: str = _env_str("RESEND_FROM_EMAIL", "")

    GROQ_API_KEY: str = _env_str("GROQ_API_KEY", "")

    OTP_TTL_SECONDS: int = _env_int("OTP_TTL_SECONDS", 300)
    OTP_MAX_ATTEMPTS: int = _env_int("OTP_MAX_ATTEMPTS", 5)
    OTP_SECRET: str = _env_str("OTP_SECRET", "")

    PASSWORD_MAX_AGE_DAYS: int = _env_int("PASSWORD_MAX_AGE_DAYS", 365)
    PASSWORD_HISTORY_LIMIT: int = _env_int("PASSWORD_HISTORY_LIMIT", 3)


@lru_cache()
def get_settings() -> Settings:
    return Settings()
