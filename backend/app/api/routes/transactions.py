from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select

from app.api.deps import CurrentUser, DbSession, get_owned_transaction
from app.models import Transaction
from app.schemas.transaction import (
    TransactionCreate,
    TransactionRead,
    TransactionUpdate,
)

router = APIRouter(prefix="/transactions", tags=["transactions"])


@router.get("", response_model=list[TransactionRead])
async def list_transactions(
    current_user: CurrentUser,
    db: DbSession,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[Transaction]:
    result = await db.scalars(
        select(Transaction)
        .where(Transaction.user_id == current_user.id)
        .order_by(Transaction.occurred_on.desc(), Transaction.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return list(result)


@router.post("", response_model=TransactionRead, status_code=status.HTTP_201_CREATED)
async def create_transaction(
    payload: TransactionCreate,
    current_user: CurrentUser,
    db: DbSession,
) -> Transaction:
    # user_id is taken from the token, never from the request body.
    transaction = Transaction(**payload.model_dump(), user_id=current_user.id)
    db.add(transaction)
    await db.commit()
    await db.refresh(transaction)
    return transaction


@router.get("/{transaction_id}", response_model=TransactionRead)
async def read_transaction(
    transaction: Annotated[Transaction, Depends(get_owned_transaction)],
) -> Transaction:
    return transaction


@router.patch("/{transaction_id}", response_model=TransactionRead)
async def update_transaction(
    payload: TransactionUpdate,
    transaction: Annotated[Transaction, Depends(get_owned_transaction)],
    db: DbSession,
) -> Transaction:
    changes = payload.model_dump(exclude_unset=True)
    # description/amount cannot be null in the database; ignore explicit nulls
    # for them while still allowing `category` to be cleared.
    for field in ("description", "amount", "occurred_on"):
        if field in changes and changes[field] is None:
            changes.pop(field)

    for field, value in changes.items():
        setattr(transaction, field, value)

    await db.commit()
    await db.refresh(transaction)
    return transaction


@router.delete("/{transaction_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_transaction(
    transaction: Annotated[Transaction, Depends(get_owned_transaction)],
    db: DbSession,
) -> None:
    await db.delete(transaction)
    await db.commit()
