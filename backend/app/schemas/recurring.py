from datetime import date, datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

MAX_ABSOLUTE_AMOUNT = Decimal("9999999999.99")
FrequencyType = Literal["daily", "weekly", "monthly", "yearly"]


class RecurringBase(BaseModel):
    description: str = Field(min_length=1, max_length=200)
    amount: Decimal = Field(max_digits=12, decimal_places=2, allow_inf_nan=False)
    category: str | None = Field(default=None, max_length=50)
    frequency: FrequencyType = "monthly"
    start_date: date = Field(default_factory=date.today)

    @field_validator("description")
    @classmethod
    def strip_description(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("Description cannot be blank")
        return stripped

    @field_validator("category")
    @classmethod
    def strip_category(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None

    @field_validator("amount")
    @classmethod
    def validate_amount(cls, value: Decimal) -> Decimal:
        if value == 0:
            raise ValueError("Amount must not be zero")
        if abs(value) > MAX_ABSOLUTE_AMOUNT:
            raise ValueError("Amount is too large")
        return value.quantize(Decimal("0.01"))


class RecurringCreate(RecurringBase):
    pass


class RecurringUpdate(BaseModel):
    description: str | None = Field(default=None, min_length=1, max_length=200)
    amount: Decimal | None = Field(
        default=None, max_digits=12, decimal_places=2, allow_inf_nan=False
    )
    category: str | None = Field(default=None, max_length=50)
    frequency: FrequencyType | None = None
    is_active: bool | None = None

    @field_validator("description")
    @classmethod
    def strip_description(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        if not stripped:
            raise ValueError("Description cannot be blank")
        return stripped

    @field_validator("category")
    @classmethod
    def strip_category(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None

    @field_validator("amount")
    @classmethod
    def validate_amount(cls, value: Decimal | None) -> Decimal | None:
        if value is None:
            return None
        if value == 0:
            raise ValueError("Amount must not be zero")
        if abs(value) > MAX_ABSOLUTE_AMOUNT:
            raise ValueError("Amount is too large")
        return value.quantize(Decimal("0.01"))


class RecurringRead(RecurringBase):
    id: UUID
    user_id: UUID
    next_date: date
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class RecurringProcessResult(BaseModel):
    processed: int = Field(description="Number of recurring transactions generated")
    created_transactions: list[UUID] = Field(
        default_factory=list, description="IDs of created transaction rows"
    )
