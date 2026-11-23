import calendar
from datetime import date
from decimal import Decimal
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Response, status
from sqlalchemy import func, select

from app.api.deps import CurrentUser, DbSession
from app.models.budget import Budget
from app.models.transaction import Transaction
from app.schemas.budget import (
    BudgetCreate,
    BudgetListResponse,
    BudgetRead,
    BudgetUpdate,
    BudgetWithSpend,
)

router = APIRouter(prefix="/budgets", tags=["budgets"])


def _as_money(value: object) -> Decimal:
    amount = value if isinstance(value, Decimal) else Decimal(str(value or 0))
    return amount.quantize(Decimal("0.01"))


@router.get("", response_model=BudgetListResponse)
async def list_budgets(
    current_user: CurrentUser,
    db: DbSession,
    month: Annotated[str | None, Query(pattern=r"^\d{4}-\d{2}$")] = None,
) -> BudgetListResponse:
    today = date.today()
    if month is None:
        target_year = today.year
        target_month = today.month
        month_str = f"{target_year:04d}-{target_month:02d}"
    else:
        parts = month.split("-")
        target_year = int(parts[0])
        target_month = int(parts[1])
        if target_month < 1 or target_month > 12:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Invalid month specified.",
            )
        month_str = month

    last_day = calendar.monthrange(target_year, target_month)[1]
    start_date = date(target_year, target_month, 1)
    end_date = date(target_year, target_month, last_day)

    # Load all budgets for current user
    budget_records = (
        await db.scalars(
            select(Budget).where(Budget.user_id == current_user.id).order_by(Budget.category.asc())
        )
    ).all()

    # Query expenses by category for this user in target month
    spend_query = (
        select(
            Transaction.category,
            func.sum(-Transaction.amount).label("total_spent"),
        )
        .where(
            Transaction.user_id == current_user.id,
            Transaction.amount < 0,
            Transaction.occurred_on >= start_date,
            Transaction.occurred_on <= end_date,
            Transaction.category.is_not(None),
        )
        .group_by(Transaction.category)
    )
    spend_results = (await db.execute(spend_query)).all()
    spend_map: dict[str, Decimal] = {
        row[0].strip().lower(): _as_money(row[1]) for row in spend_results if row[0]
    }

    items: list[BudgetWithSpend] = []
    total_budget = Decimal("0.00")
    total_spent = Decimal("0.00")

    for b in budget_records:
        limit = _as_money(b.monthly_limit)
        cat_key = b.category.strip().lower()
        spent = spend_map.get(cat_key, Decimal("0.00"))
        remaining = limit - spent
        percentage = round(float((spent / limit) * 100), 1) if limit > Decimal("0.00") else 0.0
        is_over = spent > limit

        total_budget += limit
        total_spent += spent

        items.append(
            BudgetWithSpend(
                id=b.id,
                category=b.category,
                monthly_limit=limit,
                spent=spent,
                remaining=remaining,
                percentage=percentage,
                is_over_budget=is_over,
                currency=current_user.currency,
            )
        )

    return BudgetListResponse(
        items=items,
        total_budget=total_budget,
        total_spent=total_spent,
        currency=current_user.currency,
        month=month_str,
    )


@router.post("", response_model=BudgetRead, status_code=status.HTTP_201_CREATED)
async def create_budget(
    payload: BudgetCreate,
    current_user: CurrentUser,
    db: DbSession,
    response: Response,
) -> Budget:
    # Check if a budget already exists for this category
    existing = await db.scalar(
        select(Budget).where(
            Budget.user_id == current_user.id,
            func.lower(Budget.category) == payload.category.strip().lower(),
        )
    )
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A budget for category '{payload.category}' already exists.",
        )

    budget = Budget(
        user_id=current_user.id,
        category=payload.category.strip(),
        monthly_limit=payload.monthly_limit,
    )
    db.add(budget)
    await db.commit()
    await db.refresh(budget)
    response.headers["Location"] = f"{router.prefix}/{budget.id}"
    return budget


@router.patch("/{budget_id}", response_model=BudgetRead)
async def update_budget(
    budget_id: UUID,
    payload: BudgetUpdate,
    current_user: CurrentUser,
    db: DbSession,
) -> Budget:
    budget = await db.scalar(
        select(Budget).where(
            Budget.id == budget_id,
            Budget.user_id == current_user.id,
        )
    )
    if budget is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Budget not found.",
        )

    budget.monthly_limit = payload.monthly_limit
    await db.commit()
    await db.refresh(budget)
    return budget


@router.delete("/{budget_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_budget(
    budget_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
) -> None:
    budget = await db.scalar(
        select(Budget).where(
            Budget.id == budget_id,
            Budget.user_id == current_user.id,
        )
    )
    if budget is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Budget not found.",
        )

    await db.delete(budget)
    await db.commit()
