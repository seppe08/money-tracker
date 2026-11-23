import calendar
from datetime import date
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import case, func, select

from app.api.deps import CurrentUser, DbSession
from app.models import Transaction
from app.schemas.analytics import (
    CategoryAnalyticsResponse,
    CategorySpendingItem,
    MonthlyAnalyticsResponse,
    MonthlyTrendItem,
)

router = APIRouter(prefix="/analytics", tags=["analytics"])


def _as_money(value: object) -> Decimal:
    amount = value if isinstance(value, Decimal) else Decimal(str(value or 0))
    return amount.quantize(Decimal("0.01"))


def _validate_date_range(from_date: date | None, to_date: date | None) -> None:
    if from_date is not None and to_date is not None and from_date > to_date:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="from_date must be on or before to_date.",
        )


@router.get("/categories", response_model=CategoryAnalyticsResponse)
async def get_category_analytics(
    current_user: CurrentUser,
    db: DbSession,
    from_date: date | None = None,
    to_date: date | None = None,
) -> CategoryAnalyticsResponse:
    _validate_date_range(from_date, to_date)

    filters = [
        Transaction.user_id == current_user.id,
        Transaction.amount < 0,
    ]
    if from_date is not None:
        filters.append(Transaction.occurred_on >= from_date)
    if to_date is not None:
        filters.append(Transaction.occurred_on <= to_date)

    cat_col = func.coalesce(
        case((Transaction.category == "", None), else_=Transaction.category),
        "Uncategorized",
    )

    stmt = (
        select(
            cat_col.label("category"),
            func.sum(-Transaction.amount).label("total_amount"),
            func.count(Transaction.id).label("item_count"),
        )
        .where(*filters)
        .group_by(cat_col)
        .order_by(func.sum(-Transaction.amount).desc())
    )

    rows = (await db.execute(stmt)).all()

    total_expenses = Decimal("0.00")
    raw_items: list[tuple[str, Decimal, int]] = []
    for row in rows:
        amount = _as_money(row[1])
        total_expenses += amount
        raw_items.append((str(row[0]), amount, int(row[2])))

    items: list[CategorySpendingItem] = []
    for cat_name, amount, count in raw_items:
        percentage = (
            round(float((amount / total_expenses) * 100), 1)
            if total_expenses > Decimal("0.00")
            else 0.0
        )
        items.append(
            CategorySpendingItem(
                category=cat_name,
                amount=amount,
                count=count,
                percentage=percentage,
            )
        )

    return CategoryAnalyticsResponse(
        items=items,
        total_expenses=total_expenses,
        currency=current_user.currency,
    )


@router.get("/monthly", response_model=MonthlyAnalyticsResponse)
async def get_monthly_analytics(
    current_user: CurrentUser,
    db: DbSession,
    months: Annotated[int, Query(ge=1, le=24)] = 6,
) -> MonthlyAnalyticsResponse:
    today = date.today()

    # Generate sequence of trailing months ending at current month
    month_list: list[tuple[int, int]] = []
    cur_year = today.year
    cur_month = today.month

    for _ in range(months):
        month_list.append((cur_year, cur_month))
        cur_month -= 1
        if cur_month == 0:
            cur_month = 12
            cur_year -= 1

    month_list.reverse()

    oldest_year, oldest_month = month_list[0]
    start_date = date(oldest_year, oldest_month, 1)
    last_year, last_month = month_list[-1]
    last_day = calendar.monthrange(last_year, last_month)[1]
    end_date = date(last_year, last_month, last_day)

    # Query all user transactions in this date window
    stmt = select(
        Transaction.occurred_on,
        Transaction.amount,
    ).where(
        Transaction.user_id == current_user.id,
        Transaction.occurred_on >= start_date,
        Transaction.occurred_on <= end_date,
    )
    result = (await db.execute(stmt)).all()

    # Aggregate by (year, month)
    monthly_data: dict[tuple[int, int], dict[str, Decimal]] = {
        (y, m): {"income": Decimal("0.00"), "expenses": Decimal("0.00")} for y, m in month_list
    }

    for row in result:
        occurred_on: date = row[0]
        amount: Decimal = row[1]
        key = (occurred_on.year, occurred_on.month)
        if key in monthly_data:
            if amount > Decimal("0.00"):
                monthly_data[key]["income"] += amount
            elif amount < Decimal("0.00"):
                monthly_data[key]["expenses"] += -amount

    items: list[MonthlyTrendItem] = []
    for y, m in month_list:
        data_bucket = monthly_data[(y, m)]
        income = _as_money(data_bucket["income"])
        expenses = _as_money(data_bucket["expenses"])
        net = income - expenses
        month_str = f"{y:04d}-{m:02d}"
        label = f"{calendar.month_abbr[m]} {y}"
        items.append(
            MonthlyTrendItem(
                month=month_str,
                label=label,
                income=income,
                expenses=expenses,
                net=net,
            )
        )

    return MonthlyAnalyticsResponse(
        items=items,
        currency=current_user.currency,
    )
