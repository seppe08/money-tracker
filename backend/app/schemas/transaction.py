from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

# Numeric(12, 2) allows up to 9,999,999,999.99.
MAX_ABSOLUTE_AMOUNT = Decimal("9999999999.99")


def _validate_amount(value: Decimal) -> Decimal:
    if value == 0:
        raise ValueError("Amount must not be zero")
    if abs(value) > MAX_ABSOLUTE_AMOUNT:
        raise ValueError("Amount is too large")
    return value


def _normalize_category(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


class TransactionBase(BaseModel):
    description: str = Field(min_length=1, max_length=200)
    amount: Decimal = Field(max_digits=12, decimal_places=2, allow_inf_nan=False)
    category: str | None = Field(default=None, max_length=50)
    occurred_on: date = Field(default_factory=date.today)

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
        return _normalize_category(value)

    @field_validator("amount")
    @classmethod
    def validate_amount(cls, value: Decimal) -> Decimal:
        return _validate_amount(value)


class TransactionCreate(TransactionBase):
    pass


class TransactionUpdate(BaseModel):
    description: str | None = Field(default=None, min_length=1, max_length=200)
    amount: Decimal | None = Field(
        default=None, max_digits=12, decimal_places=2, allow_inf_nan=False
    )
    category: str | None = Field(default=None, max_length=50)
    occurred_on: date | None = None

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
        return _normalize_category(value)

    @field_validator("amount")
    @classmethod
    def validate_amount(cls, value: Decimal | None) -> Decimal | None:
        return None if value is None else _validate_amount(value)


class TransactionRead(TransactionBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    created_at: datetime
    updated_at: datetime


class TransactionList(BaseModel):
    items: list[TransactionRead]
    total: int
    limit: int
    offset: int


class TransactionSummary(BaseModel):
    balance: Decimal
    income: Decimal
    expenses: Decimal
    count: int
    currency: str
