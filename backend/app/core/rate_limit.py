"""A small in-process rate limiter for unauthenticated auth endpoints.

This protects a single worker against brute force and credential stuffing.
For multi-worker or horizontally scaled deployments, back the same interface
with Redis (or rate limit at the proxy) so all workers share counters.
"""

import asyncio
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, status

from app.core.config import settings


class SlidingWindowRateLimiter:
    def __init__(self, *, limit: int, window_seconds: int) -> None:
        self.limit = limit
        self.window_seconds = window_seconds
        self._events: dict[str, deque[float]] = defaultdict(deque)
        self._lock = asyncio.Lock()

    def _client_key(self, request: Request) -> str:
        # `request.client` is the direct peer; behind a trusted proxy configure
        # uvicorn's forwarded-allow-ips so this is the real client address.
        return request.client.host if request.client else "unknown"

    async def __call__(self, request: Request) -> None:
        key = self._client_key(request)
        now = time.monotonic()

        async with self._lock:
            events = self._events[key]
            while events and now - events[0] >= self.window_seconds:
                events.popleft()

            if len(events) >= self.limit:
                retry_after = max(1, int(self.window_seconds - (now - events[0])))
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Too many requests. Please try again later.",
                    headers={"Retry-After": str(retry_after)},
                )

            events.append(now)

    def reset(self) -> None:
        """Clear counters; used by tests."""
        self._events.clear()


auth_rate_limiter = SlidingWindowRateLimiter(
    limit=settings.auth_rate_limit_requests,
    window_seconds=settings.auth_rate_limit_window_seconds,
)
