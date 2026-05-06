"""
SQLAlchemy database engine, session factory, and declarative base.

Works identically with SQLite (dev) and PostgreSQL (production);
only the DATABASE_URL changes.
"""

from sqlalchemy import Integer, create_engine, event, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from core.config import get_settings

settings = get_settings()


def _is_sqlite_url(database_url: str) -> bool:
    return str(database_url or "").startswith("sqlite")


is_sqlite = _is_sqlite_url(settings.DATABASE_URL)

if is_sqlite:
    connect_args = {"check_same_thread": False}
    engine_kwargs = {}
else:
    # Railway/Postgres connections may be dropped while idle. Keep connections short-lived
    # and ask the driver to fail fast when the server becomes unreachable.
    connect_args = {
        "connect_timeout": settings.DB_CONNECT_TIMEOUT_SECONDS,
        "keepalives": 1,
        "keepalives_idle": 30,
        "keepalives_interval": 10,
        "keepalives_count": 5,
    }
    engine_kwargs = {
        "pool_recycle": settings.DB_POOL_RECYCLE_SECONDS,
        "pool_timeout": settings.DB_POOL_TIMEOUT_SECONDS,
    }

engine = create_engine(
    settings.DATABASE_URL,
    connect_args=connect_args,
    pool_pre_ping=True,
    echo=False,
    **engine_kwargs,
)


if is_sqlite:
    @event.listens_for(engine, "connect")
    def _set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,
    bind=engine,
)


class Base(DeclarativeBase):
    """Base class for all ORM models."""


def create_all_tables():
    """Create all tables that don't exist yet. Used at startup."""
    import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    _sync_postgres_sequences()


def _sync_postgres_sequences():
    """Keep PostgreSQL SERIAL/IDENTITY sequences aligned after imports/migrations."""
    if _is_sqlite_url(settings.DATABASE_URL):
        return

    table_names = [
        table.name
        for table in Base.metadata.sorted_tables
        if "id" in table.c
        and isinstance(table.c["id"].type, Integer)
    ]
    if not table_names:
        return

    with engine.begin() as conn:
        for table_name in table_names:
            conn.execute(
                text(
                    f"""
                    SELECT setval(
                        pg_get_serial_sequence('{table_name}', 'id'),
                        COALESCE((SELECT MAX(id) FROM {table_name}), 0) + 1,
                        false
                    )
                    """
                )
            )
