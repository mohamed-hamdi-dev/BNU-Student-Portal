"""
Migrate application data from SQLite to PostgreSQL using SQLAlchemy.

Usage:
    python migrate_sqlite_to_postgres.py

Environment variables:
    SQLITE_DATABASE_URL   Optional. Defaults to sqlite:///./bnu_portal.db
    POSTGRES_DATABASE_URL Required. Example:
                          postgresql+psycopg://user:password@host:5432/dbname
"""

from __future__ import annotations

import os
from pathlib import Path

from sqlalchemy import create_engine, inspect, select, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from core.database import Base
import models  # noqa: F401


BASE_DIR = Path(__file__).resolve().parent
DEFAULT_SQLITE_URL = f"sqlite:///{BASE_DIR / 'bnu_portal.db'}"


def _build_engine(url: str) -> Engine:
    connect_args = {"check_same_thread": False} if url.startswith("sqlite") else {}
    return create_engine(url, connect_args=connect_args, pool_pre_ping=True)


def _truncate_postgres_tables(engine: Engine) -> None:
    table_names = [table.name for table in reversed(Base.metadata.sorted_tables)]
    if not table_names:
        return

    joined = ", ".join(f'"{name}"' for name in table_names)
    with engine.begin() as conn:
        conn.execute(text(f"TRUNCATE TABLE {joined} RESTART IDENTITY CASCADE"))


def _recreate_postgres_tables(engine: Engine) -> None:
    # The migration is intentionally destructive for the target DB so that the
    # PostgreSQL schema always matches the current ORM definitions before data
    # is copied from SQLite.
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


def _copy_table(source_session: Session, target_session: Session, table_name: str) -> int:
    table = Base.metadata.tables[table_name]
    rows = source_session.execute(select(table)).mappings().all()
    if not rows:
        return 0

    copied = 0
    batch: list[dict] = []

    def _flush_batch() -> None:
        nonlocal copied, batch
        if not batch:
            return
        target_session.execute(table.insert(), batch)
        copied += len(batch)
        batch = []

    for row in rows:
        row_dict = dict(row)
        batch.append(row_dict)

        # Railway proxy connections can fail on large prepared batches,
        # especially when rows contain long HTML/blob-like text.
        if len(batch) >= 10:
            _flush_batch()

    _flush_batch()
    return copied


def _reset_postgres_sequences(engine: Engine) -> None:
    inspector = inspect(engine)
    with engine.begin() as conn:
        for table in Base.metadata.sorted_tables:
            pk_columns = inspector.get_pk_constraint(table.name).get("constrained_columns") or []
            if len(pk_columns) != 1:
                continue

            pk_name = pk_columns[0]
            sequence_name = conn.execute(
                text("SELECT pg_get_serial_sequence(:table_name, :column_name)"),
                {"table_name": table.name, "column_name": pk_name},
            ).scalar()
            if not sequence_name:
                continue

            conn.execute(
                text(
                    f"""
                    SELECT setval(
                        '{sequence_name}',
                        COALESCE((SELECT MAX("{pk_name}") FROM "{table.name}"), 0),
                        COALESCE((SELECT MAX("{pk_name}") FROM "{table.name}") IS NOT NULL, FALSE)
                    )
                    """
                )
            )


def migrate(sqlite_url: str, postgres_url: str) -> None:
    sqlite_engine = _build_engine(sqlite_url)
    postgres_engine = _build_engine(postgres_url)

    if sqlite_engine.dialect.name != "sqlite":
        raise ValueError("SQLITE_DATABASE_URL must point to a SQLite database")
    if postgres_engine.dialect.name != "postgresql":
        raise ValueError("POSTGRES_DATABASE_URL must point to a PostgreSQL database")

    _recreate_postgres_tables(postgres_engine)

    migrated_counts: list[tuple[str, int]] = []
    with Session(sqlite_engine) as source_session, Session(postgres_engine) as target_session:
        for table in Base.metadata.sorted_tables:
            count = _copy_table(source_session, target_session, table.name)
            migrated_counts.append((table.name, count))
            target_session.commit()

    _reset_postgres_sequences(postgres_engine)

    print("Migration completed successfully.")
    for table_name, count in migrated_counts:
        print(f"{table_name}: {count} rows")


if __name__ == "__main__":
    sqlite_url = os.getenv("SQLITE_DATABASE_URL", DEFAULT_SQLITE_URL)
    postgres_url = os.getenv("POSTGRES_DATABASE_URL", "").strip()

    if not postgres_url:
        raise SystemExit("POSTGRES_DATABASE_URL is required")

    migrate(sqlite_url=sqlite_url, postgres_url=postgres_url)
