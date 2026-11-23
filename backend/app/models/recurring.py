import uuid
from datetime import date
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Date, ForeignKey, Numeric, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.user import User


class RecurringTransaction(TimestampMixin, Base):
    __tablename__ = "recurring_transactions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    description: Mapped[str] = mapped_column(String(200))
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    category: Mapped[str | None] = mapped_column(String(50), default=None)
    frequency: Mapped[str] = mapped_column(String(20), default="monthly")
    start_date: Mapped[date] = mapped_column(Date, default=date.today)
    next_date: Mapped[date] = mapped_column(Date, default=date.today)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    user: Mapped[User] = relationship(back_populates="recurring_transactions")
