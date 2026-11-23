from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

MAX_ABSOLUTE_AMOUNT = Decimal("9999999999.99")


class BudgetBase(BaseModel):
    category: str = Field(min_length=1, max_length=50)
    monthly_limit: Decimal = Field(gt=0, max_digits=12, decimal_places=2, allow_inf_nan=False)

    @field_validator("category")
    @classmethod
    def strip_category(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("Category cannot be blank")
        return stripped

    @field_validator("monthly_limit")
    @classmethod
    def validate_monthly_limit(cls, value: Decimal) -> Decimal:
        if value <= 0:
            raise ValueError("Monthly limit must be greater than zero")
        if value > MAX_ABSOLUTE_AMOUNT:
            raise ValueError("Monthly limit is too large")
        return value.quantize(Decimal("0.01"))


class BudgetCreate(BudgetBase):
    pass


class BudgetUpdate(BaseModel):
    monthly_limit: Decimal = Field(gt=0, max_digits=12, decimal_places=2, allow_inf_nan=False)

    @field_validator("monthly_limit")
    @classmethod
    def validate_monthly_limit(cls, value: Decimal) -> Decimal:
        if value <= 0:
            raise ValueError("Monthly limit must be greater than zero")
        if value > MAX_ABSOLUTE_AMOUNT:
            raise ValueError("Monthly limit is too large")
        return value.quantize(Decimal("0.01"))


class BudgetRead(BudgetBase):
    id: UUID
    user_id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class BudgetWithSpend(BaseModel):
    id: UUID
    category: str
    monthly_limit: Decimal
    spent: Decimal
    remaining: Decimal
    percentage: float
    is_over_budget: bool
    currency: str

    model_config = ConfigDict(from_attributes=True)


class BudgetListResponse(BaseModel):
    items: list[BudgetWithSpend]
    total_budget: Decimal
    total_spent: Decimal
    currency: str
    month: str

    model_config = ConfigDict(from_attributes=True)
