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

    JWT_SECRET_KEY: str = os.getenv("JWT_SECRET_KEY", "CHANGE-ME-in-production-use-openssl-rand-hex-32")
    JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("JWT_ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))

    CORS_ORIGINS: list[str] = os.getenv(
        "CORS_ORIGINS", "http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173"
    ).split(",")

    SMTP_HOST: str = os.getenv("SMTP_HOST", "smtp.gmail.com")
    SMTP_PORT: int = int(os.getenv("SMTP_PORT", "587"))
    MAIL_USERNAME: str = os.getenv("MAIL_USERNAME", "")
    MAIL_PASSWORD: str = os.getenv("MAIL_PASSWORD", "")

    GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")

    OTP_TTL_SECONDS: int = int(os.getenv("OTP_TTL_SECONDS", "300"))
    OTP_MAX_ATTEMPTS: int = int(os.getenv("OTP_MAX_ATTEMPTS", "5"))
    OTP_SECRET: str = os.getenv("OTP_SECRET", "")

    PASSWORD_MAX_AGE_DAYS: int = int(os.getenv("PASSWORD_MAX_AGE_DAYS", "365"))
    PASSWORD_HISTORY_LIMIT: int = int(os.getenv("PASSWORD_HISTORY_LIMIT", "3"))


@lru_cache()
def get_settings() -> Settings:
    return Settings()
