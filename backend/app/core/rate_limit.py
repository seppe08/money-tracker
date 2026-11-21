"""A small in-process rate limiter for unauthenticated auth endpoints.

This protects a single worker against brute force and credential stuffing.
For multi-worker or horizontally scaled deployments, back the same interface
with Redis (or rate limit at the proxy) so all workers share counters.
"""

import asyncio
import math
import time
from collections import deque

from fastapi import HTTPException, Request, status

from app.core.config import settings


class SlidingWindowRateLimiter:
    def __init__(
        self,
        *,
        limit: int,
        window_seconds: int,
        max_keys: int = 10_000,
        trust_forwarded_for: bool = False,
    ) -> None:
        self.limit = limit
        self.window_seconds = window_seconds
        self.max_keys = max_keys
        self.trust_forwarded_for = trust_forwarded_for
        self._events: dict[str, deque[float]] = {}
        self._lock = asyncio.Lock()
        self._last_cleanup = time.monotonic()

    def _client_key(self, request: Request) -> str:
        # Only trust X-Forwarded-For behind a proxy that overwrites the header.
        if self.trust_forwarded_for:
            forwarded = request.headers.get("x-forwarded-for")
            if forwarded:
                return forwarded.split(",", 1)[0].strip()[:64]
        # `request.client` is the direct peer; behind a trusted proxy configure
        # uvicorn's forwarded-allow-ips so this is the real client address.
        return request.client.host if request.client else "unknown"

    def _purge_expired(self, now: float) -> None:
        """Drop idle keys so rotating source addresses cannot grow memory forever."""
        if now - self._last_cleanup < self.window_seconds:
            return
        self._last_cleanup = now
        stale = [
            key
            for key, events in self._events.items()
            if not events or now - events[-1] >= self.window_seconds
        ]
        for key in stale:
            del self._events[key]

    def _evict_oldest(self) -> None:
        oldest = min(
            self._events,
            key=lambda key: self._events[key][-1] if self._events[key] else 0.0,
        )
        del self._events[oldest]

    async def __call__(self, request: Request) -> None:
        key = self._client_key(request)
        now = time.monotonic()

        async with self._lock:
            self._purge_expired(now)

            events = self._events.get(key)
            if events is None:
                if len(self._events) >= self.max_keys:
                    self._evict_oldest()
                events = deque()
                self._events[key] = events

            while events and now - events[0] >= self.window_seconds:
                events.popleft()

            if len(events) >= self.limit:
                retry_after = max(1, math.ceil(self.window_seconds - (now - events[0])))
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Too many requests. Please try again later.",
                    headers={"Retry-After": str(retry_after)},
                )

            events.append(now)

    @property
    def tracked_keys(self) -> int:
        return len(self._events)

    def reset(self) -> None:
        """Clear counters; used by tests."""
        self._events.clear()
        self._last_cleanup = time.monotonic()


auth_rate_limiter = SlidingWindowRateLimiter(
    limit=settings.auth_rate_limit_requests,
    window_seconds=settings.auth_rate_limit_window_seconds,
    max_keys=settings.auth_rate_limit_max_keys,
    trust_forwarded_for=settings.trust_forwarded_for,
)
