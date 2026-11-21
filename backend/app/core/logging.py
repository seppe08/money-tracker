"""Logging configuration with request correlation.

Every request gets an id (from `X-Request-ID` when supplied by a trusted proxy,
otherwise generated) that is attached to each log line through a contextvar.
Tokens, passwords, and request bodies are never logged.
"""

import json
import logging
import sys
from contextvars import ContextVar

from app.core.config import settings

request_id_ctx: ContextVar[str] = ContextVar("request_id", default="-")

_SENSITIVE_KEYS = {
    "authorization",
    "cookie",
    "password",
    "refresh_token",
    "access_token",
    "jwt_secret",
    "token",
}


class RequestIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_ctx.get()
        return True


class KeyValueFormatter(logging.Formatter):
    """Human-readable, greppable output for local development."""

    def format(self, record: logging.LogRecord) -> str:
        base = super().format(record)
        return f"{base} request_id={getattr(record, 'request_id', '-')}"


class JsonFormatter(logging.Formatter):
    """One JSON object per line for log collectors in production."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, object] = {
            "timestamp": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": getattr(record, "request_id", "-"),
        }
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        for key, value in record.__dict__.items():
            if key in payload or key.startswith("_"):
                continue
            if key.lower() in _SENSITIVE_KEYS:
                continue
            if isinstance(value, str | int | float | bool) or value is None:
                payload[key] = value
        return json.dumps(payload, default=str)


def configure_logging() -> None:
    level = logging.getLevelName(settings.log_level)

    handler = logging.StreamHandler(sys.stdout)
    handler.addFilter(RequestIdFilter())
    handler.setFormatter(
        JsonFormatter()
        if settings.log_json
        else KeyValueFormatter("%(asctime)s %(levelname)s %(name)s: %(message)s")
    )

    root = logging.getLogger()
    root.handlers.clear()
    root.setLevel(level)
    root.addHandler(handler)

    # Uvicorn installs its own handlers; route them through ours instead so
    # access logs carry the request id and share one format.
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        logger = logging.getLogger(name)
        logger.handlers.clear()
        logger.propagate = True

    # SQLAlchemy is noisy at INFO and can include bound parameters.
    logging.getLogger("sqlalchemy.engine").setLevel(
        logging.INFO if settings.database_echo else logging.WARNING
    )
