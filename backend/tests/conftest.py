import os

# Settings are validated at import time, so provide a test secret before any
# application module is imported.
os.environ.setdefault("JWT_SECRET", "test-only-secret-" + "0" * 40)
os.environ.setdefault("ENVIRONMENT", "test")

from collections.abc import AsyncIterator

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import StaticPool

from app.core.rate_limit import auth_rate_limiter
from app.db.base import Base
from app.db.session import configure_engine, get_db
from app.main import app
from app.models import (  # noqa: F401
    Budget,
    RecurringTransaction,
    RefreshSession,
    Transaction,
    User,
)

TEST_DATABASE_URL = "sqlite+aiosqlite://"


@pytest_asyncio.fixture
async def engine() -> AsyncIterator[AsyncEngine]:
    test_engine = create_async_engine(
        TEST_DATABASE_URL,
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )
    configure_engine(test_engine)
    async with test_engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    yield test_engine
    await test_engine.dispose()


@pytest_asyncio.fixture
async def client(engine: AsyncEngine) -> AsyncIterator[AsyncClient]:
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    async def override_get_db() -> AsyncIterator[AsyncSession]:
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    auth_rate_limiter.reset()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as test_client:
        yield test_client

    app.dependency_overrides.clear()
    auth_rate_limiter.reset()
