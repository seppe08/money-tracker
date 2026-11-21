import logging

from fastapi import APIRouter, Response, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.api.deps import DbSession
from app.core.config import settings

logger = logging.getLogger("app.health")

router = APIRouter()


class HealthResponse(BaseModel):
    status: str
    environment: str
    version: str


class ReadinessResponse(BaseModel):
    status: str
    database: str
    version: str


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    """Liveness probe: the process is running and can serve requests."""
    return HealthResponse(
        status="ok",
        environment=settings.environment,
        version=settings.version,
    )


@router.get(
    "/health/ready",
    response_model=ReadinessResponse,
    responses={503: {"description": "A dependency is unavailable"}},
)
async def readiness(response: Response, db: DbSession) -> ReadinessResponse:
    """Readiness probe: the API can reach its database."""
    try:
        await db.execute(text("SELECT 1"))
    except SQLAlchemyError:
        logger.exception("Database readiness check failed")
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return ReadinessResponse(
            status="degraded",
            database="unavailable",
            version=settings.version,
        )

    return ReadinessResponse(
        status="ok",
        database="ok",
        version=settings.version,
    )
