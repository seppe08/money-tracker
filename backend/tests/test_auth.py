from datetime import UTC, datetime, timedelta

import pytest
from fastapi import HTTPException
from httpx import AsyncClient
from starlette.requests import Request

from app.core.rate_limit import SlidingWindowRateLimiter
from tests.helpers import bearer, encode_token, login, register


def make_request(ip: str = "203.0.113.10") -> Request:
    return Request(
        {
            "type": "http",
            "http_version": "1.1",
            "method": "POST",
            "scheme": "http",
            "path": "/",
            "query_string": b"",
            "headers": [],
            "client": (ip, 12345),
            "server": ("testserver", 80),
        }
    )


async def test_register_returns_tokens_and_user(client: AsyncClient) -> None:
    body = await register(client, email="  User@Example.com ", display_name="Ada")

    assert body["token_type"] == "bearer"
    assert body["expires_in"] > 0
    assert body["access_token"]
    assert body["refresh_token"]
    assert body["user"]["email"] == "user@example.com"
    assert body["user"]["display_name"] == "Ada"

    me = await client.get("/api/v1/users/me", headers=bearer(body["access_token"]))
    assert me.status_code == 200
    assert me.json()["id"] == body["user"]["id"]
    assert "password" not in me.text


async def test_register_rejects_duplicate_email(client: AsyncClient) -> None:
    await register(client, email="dupe@example.com")

    response = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "DUPE@example.com",
            "password": "another-long-password",
            "display_name": "Second",
        },
    )
    assert response.status_code == 409
    assert "already exists" in response.json()["detail"]


async def test_register_rejects_short_password(client: AsyncClient) -> None:
    response = await client.post(
        "/api/v1/auth/register",
        json={"email": "short@example.com", "password": "short", "display_name": "Short"},
    )
    assert response.status_code == 422


async def test_login_success(client: AsyncClient) -> None:
    await register(client, email="login@example.com")

    body = await login(client, email="LOGIN@example.com")
    assert body["user"]["email"] == "login@example.com"

    me = await client.get("/api/v1/users/me", headers=bearer(body["access_token"]))
    assert me.status_code == 200


@pytest.mark.parametrize(
    ("email", "password"),
    [
        ("login@example.com", "wrong-password-value"),
        ("missing@example.com", "wrong-password-value"),
    ],
)
async def test_login_failures_are_indistinguishable(
    client: AsyncClient, email: str, password: str
) -> None:
    await register(client, email="login@example.com")

    response = await client.post("/api/v1/auth/login", json={"email": email, "password": password})

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid email or password."
    assert response.headers["www-authenticate"] == "Bearer"


async def test_protected_route_requires_valid_bearer_token(client: AsyncClient) -> None:
    assert (await client.get("/api/v1/users/me")).status_code == 401

    malformed = await client.get("/api/v1/users/me", headers={"Authorization": "Basic abc"})
    assert malformed.status_code == 401
    assert malformed.headers["www-authenticate"] == "Bearer"

    garbage = await client.get("/api/v1/users/me", headers=bearer("not-a-jwt"))
    assert garbage.status_code == 401


async def test_expired_access_token_is_rejected(client: AsyncClient) -> None:
    body = await register(client, email="expired@example.com")
    expired = encode_token(
        sub=body["user"]["id"],
        iat=datetime.now(UTC) - timedelta(hours=2),
        nbf=datetime.now(UTC) - timedelta(hours=2),
        exp=datetime.now(UTC) - timedelta(minutes=1),
    )

    response = await client.get("/api/v1/users/me", headers=bearer(expired))
    assert response.status_code == 401


@pytest.mark.parametrize(
    "claims",
    [
        {"aud": "some-other-app"},
        {"iss": "some-other-issuer"},
        {"typ": "refresh"},
        {"ver": 999},
    ],
)
async def test_tokens_with_invalid_claims_are_rejected(client: AsyncClient, claims: dict) -> None:
    body = await register(client, email="claims@example.com")
    token = encode_token(sub=body["user"]["id"], **claims)

    response = await client.get("/api/v1/users/me", headers=bearer(token))
    assert response.status_code == 401


async def test_refresh_token_is_rejected_as_access_token(client: AsyncClient) -> None:
    body = await register(client, email="types@example.com")

    response = await client.get("/api/v1/users/me", headers=bearer(body["refresh_token"]))
    assert response.status_code == 401


async def test_refresh_rotates_and_detects_reuse(client: AsyncClient) -> None:
    body = await register(client, email="rotate@example.com")
    old_refresh = body["refresh_token"]

    refreshed = await client.post("/api/v1/auth/refresh", json={"refresh_token": old_refresh})
    assert refreshed.status_code == 200
    new_pair = refreshed.json()
    assert new_pair["refresh_token"] != old_refresh

    # Old token is single-use.
    reused = await client.post("/api/v1/auth/refresh", json={"refresh_token": old_refresh})
    assert reused.status_code == 401

    # Reuse is treated as theft: the whole family, including the newest token,
    # is revoked.
    family_revoked = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": new_pair["refresh_token"]}
    )
    assert family_revoked.status_code == 401

    me = await client.get("/api/v1/users/me", headers=bearer(new_pair["access_token"]))
    assert me.status_code == 200


async def test_logout_revokes_refresh_token(client: AsyncClient) -> None:
    body = await register(client, email="logout@example.com")

    response = await client.post(
        "/api/v1/auth/logout", json={"refresh_token": body["refresh_token"]}
    )
    assert response.status_code == 204

    refreshed = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": body["refresh_token"]}
    )
    assert refreshed.status_code == 401


async def test_logout_all_invalidates_every_token(client: AsyncClient) -> None:
    first = await register(client, email="logout-all@example.com")
    second = await login(client, email="logout-all@example.com")

    response = await client.post("/api/v1/auth/logout-all", headers=bearer(first["access_token"]))
    assert response.status_code == 204

    for token in (first["access_token"], second["access_token"]):
        assert (await client.get("/api/v1/users/me", headers=bearer(token))).status_code == 401

    for refresh_token in (first["refresh_token"], second["refresh_token"]):
        refreshed = await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
        assert refreshed.status_code == 401


async def test_rate_limiter_blocks_after_limit() -> None:
    limiter = SlidingWindowRateLimiter(limit=2, window_seconds=60)
    request = make_request()

    await limiter(request)
    await limiter(request)

    with pytest.raises(HTTPException) as exc_info:
        await limiter(request)

    assert exc_info.value.status_code == 429
    assert "Retry-After" in exc_info.value.headers

    # Another client is unaffected.
    await limiter(make_request(ip="198.51.100.20"))
