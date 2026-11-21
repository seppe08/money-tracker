import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
from httpx import AsyncClient

from app.core.config import settings

PASSWORD = "correct-horse-battery-staple"


async def register(
    client: AsyncClient,
    *,
    email: str,
    password: str = PASSWORD,
    display_name: str = "Test User",
) -> dict[str, Any]:
    response = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": password, "display_name": display_name},
    )
    assert response.status_code == 201, response.text
    return response.json()


async def login(client: AsyncClient, *, email: str, password: str = PASSWORD) -> dict[str, Any]:
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert response.status_code == 200, response.text
    return response.json()


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def encode_token(**overrides: Any) -> str:
    """Build an access token with full claims, for tampering/expiry tests."""
    now = datetime.now(UTC)
    claims: dict[str, Any] = {
        "sub": str(uuid.uuid4()),
        "iss": settings.jwt_issuer,
        "aud": settings.jwt_audience,
        "iat": now - timedelta(minutes=1),
        "nbf": now - timedelta(minutes=1),
        "exp": now + timedelta(minutes=5),
        "jti": str(uuid.uuid4()),
        "typ": "access",
        "ver": 0,
    }
    claims.update(overrides)
    return jwt.encode(
        claims,
        settings.jwt_secret.get_secret_value(),
        algorithm=settings.jwt_algorithm,
    )
