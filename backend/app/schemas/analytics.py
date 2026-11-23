from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class CategorySpendingItem(BaseModel):
    category: str = Field(description="Category name or 'Uncategorized'")
    amount: Decimal = Field(
        description="Total expense amount as a positive number",
        max_digits=12,
        decimal_places=2,
    )
    count: int = Field(description="Number of transactions in this category")
    percentage: float = Field(
        description="Percentage of total expenses in this time period, from 0 to 100"
    )

    model_config = ConfigDict(from_attributes=True)


class CategoryAnalyticsResponse(BaseModel):
    items: list[CategorySpendingItem]
    total_expenses: Decimal = Field(max_digits=12, decimal_places=2)
    currency: str

    model_config = ConfigDict(from_attributes=True)


class MonthlyTrendItem(BaseModel):
    month: str = Field(description="Month string formatted as YYYY-MM")
    label: str = Field(description="Human readable label e.g. 'Nov 2026'")
    income: Decimal = Field(max_digits=12, decimal_places=2)
    expenses: Decimal = Field(max_digits=12, decimal_places=2)
    net: Decimal = Field(max_digits=12, decimal_places=2)

    model_config = ConfigDict(from_attributes=True)


class MonthlyAnalyticsResponse(BaseModel):
    items: list[MonthlyTrendItem]
    currency: str

    model_config = ConfigDict(from_attributes=True)
