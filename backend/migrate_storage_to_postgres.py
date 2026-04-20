"""
Migrate storage_items metadata from local SQLite to PostgreSQL.

This script is intentionally narrow and non-destructive:
- It only copies rows from `storage_items`
- It updates existing rows by id instead of truncating the target DB
- It preserves stored_name so existing file references stay consistent

Usage:
    python migrate_storage_to_postgres.py

Environment variables:
    SQLITE_DATABASE_URL   Optional. Defaults to sqlite:///./bnu_portal.db
    POSTGRES_DATABASE_URL Required. Example:
                          postgresql+psycopg://user:password@host:5432/dbname
"""

from __future__ import annotations

import os
from pathlib import Path

from sqlalchemy import create_engine, select, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from models.storage import StorageItem


BASE_DIR = Path(__file__).resolve().parent
DEFAULT_SQLITE_URL = f"sqlite:///{BASE_DIR / 'bnu_portal.db'}"


def _normalize_postgres_url(url: str) -> str:
    raw = str(url or "").strip()
    if raw.startswith("postgresql+psycopg://"):
        return raw.replace("postgresql+psycopg://", "postgresql://", 1)
    return raw


def _build_engine(url: str) -> Engine:
    connect_args = {"check_same_thread": False} if url.startswith("sqlite") else {}
    return create_engine(url, connect_args=connect_args, pool_pre_ping=True)


def migrate_storage(sqlite_url: str, postgres_url: str) -> None:
    sqlite_engine = _build_engine(sqlite_url)
    postgres_engine = _build_engine(_normalize_postgres_url(postgres_url))

    if sqlite_engine.dialect.name != "sqlite":
        raise ValueError("SQLITE_DATABASE_URL must point to a SQLite database")
    if postgres_engine.dialect.name != "postgresql":
        raise ValueError("POSTGRES_DATABASE_URL must point to a PostgreSQL database")

    inserted = 0
    updated = 0

    with Session(sqlite_engine) as source_session, Session(postgres_engine) as target_session:
        source_rows = source_session.execute(select(StorageItem).order_by(StorageItem.id.asc())).scalars().all()
        if not source_rows:
            print("No local storage rows found.")
            return

        existing_ids = {
            int(row_id)
            for (row_id,) in target_session.query(StorageItem.id).all()
            if row_id is not None
        }

        for row in source_rows:
            payload = {
                "file_name": row.file_name,
                "level": row.level,
                "owner_id": row.owner_id,
                "category": row.category,
                "is_favorite": bool(row.is_favorite),
                "is_indexed": bool(row.is_indexed),
                "stored_name": row.stored_name,
                "created_at": row.created_at,
                "updated_at": row.updated_at,
            }
            if int(row.id) in existing_ids:
                existing = target_session.get(StorageItem, row.id)
                for field, value in payload.items():
                    setattr(existing, field, value)
                updated += 1
            else:
                target_session.add(StorageItem(id=row.id, **payload))
                inserted += 1

        target_session.commit()

    with postgres_engine.begin() as conn:
        conn.execute(
            text(
                """
                SELECT setval(
                    pg_get_serial_sequence('storage_items', 'id'),
                    COALESCE((SELECT MAX(id) FROM storage_items), 0),
                    COALESCE((SELECT MAX(id) FROM storage_items) IS NOT NULL, FALSE)
                )
                """
            )
        )

    print("Storage migration completed successfully.")
    print(f"Inserted rows: {inserted}")
    print(f"Updated rows: {updated}")


if __name__ == "__main__":
    sqlite_url = os.getenv("SQLITE_DATABASE_URL", DEFAULT_SQLITE_URL).strip()
    postgres_url = os.getenv("POSTGRES_DATABASE_URL", "").strip()

    if not postgres_url:
        raise SystemExit("POSTGRES_DATABASE_URL is required")

    migrate_storage(sqlite_url=sqlite_url, postgres_url=postgres_url)
