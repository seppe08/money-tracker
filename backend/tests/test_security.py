import time

import pytest
from fastapi import HTTPException
from httpx import AsyncClient
from starlette.requests import Request

from app.core.config import settings
from app.core.rate_limit import SlidingWindowRateLimiter
from tests.helpers import bearer, register


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


async def test_security_headers_and_request_id(client: AsyncClient) -> None:
    response = await client.get(
        "/api/v1/health",
        headers={"X-Request-ID": "portfolio-check-123"},
    )

    assert response.status_code == 200
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["referrer-policy"] == "no-referrer"
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-request-id"] == "portfolio-check-123"


async def test_invalid_request_id_is_replaced(client: AsyncClient) -> None:
    response = await client.get(
        "/api/v1/health",
        headers={"X-Request-ID": "bad value with spaces"},
    )

    assert response.status_code == 200
    assert response.headers["x-request-id"] != "bad value with spaces"
    assert len(response.headers["x-request-id"]) == 32


async def test_hsts_header_is_opt_in(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "hsts_enabled", True)
    response = await client.get("/api/v1/health")

    assert response.headers["strict-transport-security"].startswith("max-age=")


async def test_oversized_body_is_rejected(client: AsyncClient) -> None:
    response = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "large@example.com",
            "password": "a-long-enough-password",
            "display_name": "x" * 1_100_000,
        },
    )

    assert response.status_code == 413
    assert "too large" in response.json()["detail"].lower()


async def test_readiness_reports_database(client: AsyncClient) -> None:
    response = await client.get("/api/v1/health/ready")

    assert response.status_code == 200
    assert response.json()["database"] == "ok"
    assert response.json()["status"] == "ok"


async def test_protected_response_is_not_cached(client: AsyncClient) -> None:
    user = await register(client, email="nocache@example.com")
    response = await client.get("/api/v1/users/me", headers=bearer(user["access_token"]))

    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"


async def test_rate_limiter_bounds_memory() -> None:
    limiter = SlidingWindowRateLimiter(limit=5, window_seconds=60, max_keys=2)

    await limiter(make_request(ip="198.51.100.1"))
    await limiter(make_request(ip="198.51.100.2"))
    await limiter(make_request(ip="198.51.100.3"))

    assert limiter.tracked_keys == 2


async def test_rate_limiter_purges_idle_keys() -> None:
    limiter = SlidingWindowRateLimiter(limit=5, window_seconds=1)
    await limiter(make_request(ip="198.51.100.9"))
    assert limiter.tracked_keys == 1

    # Pretend the window elapsed without sleeping in the test.
    limiter._last_cleanup = time.monotonic() - 5
    limiter._events["198.51.100.9"].append(time.monotonic() - 5)
    await limiter(make_request(ip="198.51.100.10"))

    assert "198.51.100.9" not in limiter._events


async def test_rate_limiter_rejects_after_limit() -> None:
    limiter = SlidingWindowRateLimiter(limit=1, window_seconds=60)
    await limiter(make_request())

    with pytest.raises(HTTPException) as exc_info:
        await limiter(make_request())

    assert exc_info.value.status_code == 429
    assert exc_info.value.headers["Retry-After"]
