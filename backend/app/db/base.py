import uuid
from datetime import UTC, datetime
from typing import ClassVar

from sqlalchemy import DateTime, Uuid, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def utcnow() -> datetime:
    return datetime.now(UTC)


class Base(DeclarativeBase):
    type_annotation_map: ClassVar[dict[object, object]] = {
        uuid.UUID: Uuid,
        datetime: DateTime(timezone=True),
    }


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(default=utcnow, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        default=utcnow,
        server_default=func.now(),
        onupdate=utcnow,
    )
