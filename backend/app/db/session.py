from collections.abc import AsyncIterator

from sqlalchemy import event
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import settings

_engine: AsyncEngine | None = None
_session_factory: async_sessionmaker[AsyncSession] | None = None


def _sqlite_pragmas(dbapi_connection: object, _: object) -> None:
    """Enable constraints and sane concurrency defaults for SQLite.

    SQLite does not enforce foreign keys unless asked, so without this the
    `ON DELETE CASCADE` clauses would silently do nothing.
    """
    cursor = dbapi_connection.cursor()  # type: ignore[attr-defined]
    try:
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA busy_timeout=5000")
    finally:
        cursor.close()


def configure_engine(engine: AsyncEngine) -> None:
    """Attach SQLite pragmas to any engine, including test engines."""
    if engine.url.get_backend_name() != "sqlite":
        return
    event.listen(engine.sync_engine, "connect", _sqlite_pragmas)


def _is_memory_database() -> bool:
    database = settings.database_url.split("///", 1)[-1]
    return database in {"", ":memory:"} or "mode=memory" in database


def get_engine() -> AsyncEngine:
    """Create the engine lazily so tests can import the app without touching a database."""
    global _engine
    if _engine is None:
        engine_options: dict[str, object] = {
            "echo": settings.database_echo,
            "pool_pre_ping": True,
        }
        if settings.uses_sqlite:
            engine_options["connect_args"] = {"check_same_thread": False}
        else:
            engine_options.update(
                pool_size=settings.database_pool_size,
                max_overflow=settings.database_max_overflow,
                pool_recycle=1800,
            )

        _engine = create_async_engine(settings.database_url, **engine_options)
        configure_engine(_engine)

        if settings.uses_sqlite and not _is_memory_database():
            # WAL improves concurrent reads for file-backed SQLite databases.
            @event.listens_for(_engine.sync_engine, "connect")
            def _enable_wal(dbapi_connection: object, _: object) -> None:
                cursor = dbapi_connection.cursor()  # type: ignore[attr-defined]
                try:
                    cursor.execute("PRAGMA journal_mode=WAL")
                finally:
                    cursor.close()

    return _engine


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    global _session_factory
    if _session_factory is None:
        _session_factory = async_sessionmaker(get_engine(), expire_on_commit=False)
    return _session_factory


async def get_db() -> AsyncIterator[AsyncSession]:
    """FastAPI dependency that yields a request-scoped database session."""
    async with get_session_factory()() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise


async def dispose_engine() -> None:
    """Release pooled connections on shutdown."""
    global _engine, _session_factory
    if _engine is not None:
        await _engine.dispose()
    _engine = None
    _session_factory = None


async def init_db() -> None:
    """Create tables for local development.

    Production uses Alembic migrations (`alembic upgrade head`); this is
    intentionally a no-op when `CREATE_TABLES_ON_STARTUP=false`.
    """
    from app.db.base import Base
    from app.models import RefreshSession, Transaction, User  # noqa: F401

    if not settings.create_tables_on_startup:
        return

    async with get_engine().begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
