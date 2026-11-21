"""ASGI middleware for request correlation, security headers, and size limits."""

import logging
import time
import uuid

from starlette.datastructures import Headers, MutableHeaders
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.config import settings
from app.core.logging import request_id_ctx

logger = logging.getLogger("app.request")

_REQUEST_ID_HEADER = "X-Request-ID"
_MAX_REQUEST_ID_LENGTH = 64


def _valid_request_id(value: str) -> bool:
    if not value or len(value) > _MAX_REQUEST_ID_LENGTH:
        return False
    return all(character.isalnum() or character in "-_." for character in value)


class RequestContextMiddleware:
    """Attach a request id to logs and responses, and emit one access log line."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        supplied = Headers(scope=scope).get(_REQUEST_ID_HEADER.lower(), "")
        request_id = supplied if _valid_request_id(supplied) else uuid.uuid4().hex
        token = request_id_ctx.set(request_id)
        started = time.perf_counter()
        status_code = 500

        async def send_with_id(message: Message) -> None:
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message["status"]
                MutableHeaders(scope=message)[_REQUEST_ID_HEADER] = request_id
            await send(message)

        try:
            await self.app(scope, receive, send_with_id)
        finally:
            elapsed_ms = (time.perf_counter() - started) * 1000
            logger.info(
                "method=%s path=%s status=%s duration_ms=%.1f",
                scope.get("method", "-"),
                scope.get("path", "-"),
                status_code,
                elapsed_ms,
            )
            request_id_ctx.reset(token)


class SecurityHeadersMiddleware:
    """Baseline response headers that are safe for a JSON API."""

    def __init__(self, app: ASGIApp, *, enabled: bool = True) -> None:
        self.app = app
        self.enabled = enabled

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if not self.enabled or scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        is_api = scope.get("path", "").startswith(settings.api_v1_prefix)

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                headers.setdefault("X-Content-Type-Options", "nosniff")
                headers.setdefault("X-Frame-Options", "DENY")
                headers.setdefault("Referrer-Policy", "no-referrer")
                headers.setdefault(
                    "Permissions-Policy",
                    "camera=(), geolocation=(), microphone=(), payment=()",
                )
                headers.setdefault("X-Permitted-Cross-Domain-Policies", "none")
                if is_api:
                    # API responses can contain balances and tokens.
                    headers.setdefault("Cache-Control", "no-store")
                if settings.hsts_enabled:
                    headers.setdefault(
                        "Strict-Transport-Security",
                        f"max-age={settings.hsts_max_age_seconds}; includeSubDomains",
                    )
            await send(message)

        await self.app(scope, receive, send_with_headers)


class _RequestTooLarge(Exception):
    pass


class BodySizeLimitMiddleware:
    """Reject oversized request bodies before they reach a route handler.

    Content-Length is checked up front; the receive wrapper also counts the
    actual bytes so chunked requests cannot bypass the limit.
    """

    def __init__(self, app: ASGIApp, *, max_bytes: int) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        content_length = Headers(scope=scope).get("content-length")
        if (
            content_length is not None
            and content_length.isdigit()
            and int(content_length) > self.max_bytes
        ):
            await self._reject(scope, receive, send)
            return

        received = 0
        response_started = False

        async def limited_receive() -> Message:
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.max_bytes:
                    raise _RequestTooLarge
            return message

        async def send_tracking_start(message: Message) -> None:
            nonlocal response_started
            if message["type"] == "http.response.start":
                response_started = True
            await send(message)

        try:
            await self.app(scope, limited_receive, send_tracking_start)
        except _RequestTooLarge:
            if not response_started:
                await self._reject(scope, receive, send)

    async def _reject(self, scope: Scope, receive: Receive, send: Send) -> None:
        response = JSONResponse(
            {"detail": "Request body is too large."},
            status_code=413,
        )
        await response(scope, receive, send)
