import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import Date, ForeignKey, Index, Numeric, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class Transaction(TimestampMixin, Base):
    """A user-owned money movement. Every query filters by `user_id`."""

    __tablename__ = "transactions"
    __table_args__ = (
        # Covers the default list ordering and date-range filters.
        Index("ix_transactions_user_occurred", "user_id", "occurred_on"),
        Index("ix_transactions_user_category", "user_id", "category"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    description: Mapped[str] = mapped_column(String(200))
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    category: Mapped[str | None] = mapped_column(String(50), default=None)
    occurred_on: Mapped[date] = mapped_column(Date, default=date.today)


__all__ = ["Transaction"]
