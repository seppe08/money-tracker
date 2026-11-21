import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.trustedhost import TrustedHostMiddleware

from app.api.router import api_router
from app.core.config import settings
from app.core.logging import configure_logging
from app.core.middleware import (
    BodySizeLimitMiddleware,
    RequestContextMiddleware,
    SecurityHeadersMiddleware,
)
from app.db.session import dispose_engine, init_db

logger = logging.getLogger("app.main")

# Expo serves the web build from whatever address the dev machine has, which
# changes between networks. Allow private-network origins in development only;
# production keeps the explicit CORS_ORIGINS list.
DEV_ORIGIN_REGEX = (
    r"^https?://(?:localhost|127\.0\.0\.1|\[::1\]"
    r"|10(?:\.\d{1,3}){3}"
    r"|192\.168(?:\.\d{1,3}){2}"
    r"|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}):\d+$"
)

OPENAPI_TAGS = [
    {"name": "health", "description": "Liveness and readiness probes."},
    {"name": "auth", "description": "Registration, login, refresh, and revocation."},
    {"name": "users", "description": "The authenticated user's profile and credentials."},
    {"name": "transactions", "description": "User-owned money movements and summaries."},
    {"name": "meta", "description": "Service metadata."},
]


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    # Dev convenience; production deployments run `alembic upgrade head` and
    # set CREATE_TABLES_ON_STARTUP=false.
    await init_db()
    logger.info(
        "startup environment=%s version=%s",
        settings.environment,
        settings.version,
    )
    try:
        yield
    finally:
        await dispose_engine()
        logger.info("shutdown complete")


def create_app() -> FastAPI:
    configure_logging()

    app = FastAPI(
        title=settings.app_name,
        version=settings.version,
        description=(
            "Personal finance API with rotating JWT sessions and per-user data "
            "ownership. Send the access token as `Authorization: Bearer <token>`."
        ),
        docs_url="/docs" if settings.docs_enabled else None,
        redoc_url="/redoc" if settings.docs_enabled else None,
        openapi_url="/openapi.json" if settings.docs_enabled else None,
        openapi_tags=OPENAPI_TAGS,
        contact={"name": "Money Tracker maintainers"},
        license_info={"name": "MIT", "identifier": "MIT"},
        lifespan=lifespan,
    )

    # Execution order is the reverse of registration: TrustedHost -> request
    # context -> CORS -> body limit -> security headers -> routes.
    app.add_middleware(
        SecurityHeadersMiddleware,
        enabled=settings.security_headers_enabled,
    )
    app.add_middleware(
        BodySizeLimitMiddleware,
        max_bytes=settings.max_request_body_bytes,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_origin_regex=None if settings.is_production else DEV_ORIGIN_REGEX,
        # Authentication uses bearer tokens, not cookies, so credentialed CORS
        # is unnecessary and would widen the attack surface.
        allow_credentials=False,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Accept", "Authorization", "Content-Type", "X-Request-ID"],
        expose_headers=["X-Request-ID", "X-Total-Count"],
        max_age=600,
    )
    app.add_middleware(RequestContextMiddleware)
    app.add_middleware(
        TrustedHostMiddleware,
        allowed_hosts=settings.trusted_hosts,
    )

    app.include_router(api_router, prefix=settings.api_v1_prefix)

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(_: Request, exc: Exception) -> JSONResponse:
        # Log the stack trace server-side, but never leak internals to clients.
        logger.exception("Unhandled exception", exc_info=exc)
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal server error."},
        )

    @app.get("/", tags=["meta"])
    async def root() -> dict[str, str]:
        return {
            "name": settings.app_name,
            "version": settings.version,
            "health": f"{settings.api_v1_prefix}/health",
            "docs": "/docs" if settings.docs_enabled else "disabled",
        }

    return app


app = create_app()
