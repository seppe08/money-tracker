import calendar
from datetime import date, timedelta
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Response, status
from sqlalchemy import select

from app.api.deps import CurrentUser, DbSession
from app.models.recurring import RecurringTransaction
from app.models.transaction import Transaction
from app.schemas.recurring import (
    RecurringCreate,
    RecurringProcessResult,
    RecurringRead,
    RecurringUpdate,
)

router = APIRouter(prefix="/recurring", tags=["recurring"])


def advance_date(current: date, frequency: str) -> date:
    """Advance a date based on recurring frequency."""
    if frequency == "daily":
        return current + timedelta(days=1)
    if frequency == "weekly":
        return current + timedelta(weeks=1)
    if frequency == "monthly":
        year = current.year + (1 if current.month == 12 else 0)
        month = 1 if current.month == 12 else current.month + 1
        max_days = calendar.monthrange(year, month)[1]
        day = min(current.day, max_days)
        return date(year, month, day)
    if frequency == "yearly":
        try:
            return current.replace(year=current.year + 1)
        except ValueError:
            return date(current.year + 1, 2, 28)
    return current + timedelta(days=30)


@router.get("", response_model=list[RecurringRead])
async def list_recurring(
    current_user: CurrentUser,
    db: DbSession,
    is_active: Annotated[bool | None, Query()] = None,
) -> list[RecurringTransaction]:
    stmt = select(RecurringTransaction).where(RecurringTransaction.user_id == current_user.id)
    if is_active is not None:
        stmt = stmt.where(RecurringTransaction.is_active == is_active)
    stmt = stmt.order_by(
        RecurringTransaction.next_date.asc(),
        RecurringTransaction.created_at.asc(),
    )
    records = await db.scalars(stmt)
    return list(records.all())


@router.post("", response_model=RecurringRead, status_code=status.HTTP_201_CREATED)
async def create_recurring(
    payload: RecurringCreate,
    current_user: CurrentUser,
    db: DbSession,
    response: Response,
) -> RecurringTransaction:
    recurring = RecurringTransaction(
        user_id=current_user.id,
        description=payload.description,
        amount=payload.amount,
        category=payload.category,
        frequency=payload.frequency,
        start_date=payload.start_date,
        next_date=payload.start_date,
        is_active=True,
    )
    db.add(recurring)
    await db.commit()
    await db.refresh(recurring)
    response.headers["Location"] = f"{router.prefix}/{recurring.id}"
    return recurring


@router.post("/process", response_model=RecurringProcessResult)
async def process_recurring(
    current_user: CurrentUser,
    db: DbSession,
    target_date: Annotated[date | None, Query()] = None,
) -> RecurringProcessResult:
    effective_date = target_date or date.today()
    stmt = (
        select(RecurringTransaction)
        .where(
            RecurringTransaction.user_id == current_user.id,
            RecurringTransaction.is_active.is_(True),
            RecurringTransaction.next_date <= effective_date,
        )
        .order_by(RecurringTransaction.next_date.asc())
    )
    rules = (await db.scalars(stmt)).all()
    created_ids: list[UUID] = []

    for rule in rules:
        iterations = 0
        while rule.next_date <= effective_date and iterations < 50:
            tx = Transaction(
                user_id=current_user.id,
                description=rule.description,
                amount=rule.amount,
                category=rule.category,
                occurred_on=rule.next_date,
            )
            db.add(tx)
            await db.flush()
            created_ids.append(tx.id)
            rule.next_date = advance_date(rule.next_date, rule.frequency)
            iterations += 1

    if created_ids:
        await db.commit()

    return RecurringProcessResult(
        processed=len(created_ids),
        created_transactions=created_ids,
    )


@router.get("/{recurring_id}", response_model=RecurringRead)
async def get_recurring(
    recurring_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
) -> RecurringTransaction:
    rule = await db.scalar(
        select(RecurringTransaction).where(
            RecurringTransaction.id == recurring_id,
            RecurringTransaction.user_id == current_user.id,
        )
    )
    if rule is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Recurring transaction not found.",
        )
    return rule


@router.patch("/{recurring_id}", response_model=RecurringRead)
async def update_recurring(
    recurring_id: UUID,
    payload: RecurringUpdate,
    current_user: CurrentUser,
    db: DbSession,
) -> RecurringTransaction:
    rule = await db.scalar(
        select(RecurringTransaction).where(
            RecurringTransaction.id == recurring_id,
            RecurringTransaction.user_id == current_user.id,
        )
    )
    if rule is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Recurring transaction not found.",
        )

    if payload.description is not None:
        rule.description = payload.description
    if payload.amount is not None:
        rule.amount = payload.amount
    if payload.category is not None:
        rule.category = payload.category
    if payload.frequency is not None:
        rule.frequency = payload.frequency
    if payload.is_active is not None:
        rule.is_active = payload.is_active

    await db.commit()
    await db.refresh(rule)
    return rule


@router.delete("/{recurring_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_recurring(
    recurring_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
) -> None:
    rule = await db.scalar(
        select(RecurringTransaction).where(
            RecurringTransaction.id == recurring_id,
            RecurringTransaction.user_id == current_user.id,
        )
    )
    if rule is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Recurring transaction not found.",
        )

    await db.delete(rule)
    await db.commit()
