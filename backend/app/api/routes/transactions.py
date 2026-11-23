import csv
import io
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import case, func, or_, select
from sqlalchemy.sql.elements import ColumnElement

from app.api.deps import CurrentUser, DbSession, get_owned_transaction
from app.models import Transaction
from app.schemas.transaction import (
    MAX_ABSOLUTE_AMOUNT,
    TransactionCreate,
    TransactionImportResult,
    TransactionList,
    TransactionRead,
    TransactionSummary,
    TransactionUpdate,
)

router = APIRouter(prefix="/transactions", tags=["transactions"])

SortOrder = Literal["date_desc", "date_asc", "amount_desc", "amount_asc"]
TransactionKind = Literal["income", "expense"]

_SORT_CLAUSES: dict[SortOrder, tuple[ColumnElement[Any], ...]] = {
    "date_desc": (Transaction.occurred_on.desc(), Transaction.created_at.desc()),
    "date_asc": (Transaction.occurred_on.asc(), Transaction.created_at.asc()),
    "amount_desc": (Transaction.amount.desc(), Transaction.occurred_on.desc()),
    "amount_asc": (Transaction.amount.asc(), Transaction.occurred_on.desc()),
}


def _escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _build_filters(
    *,
    user_id: UUID,
    search: str | None,
    category: str | None,
    kind: TransactionKind | None,
    from_date: date | None,
    to_date: date | None,
) -> list[ColumnElement[bool]]:
    filters: list[ColumnElement[bool]] = [Transaction.user_id == user_id]

    if search:
        term = f"%{_escape_like(search.strip())}%"
        filters.append(
            or_(
                Transaction.description.ilike(term, escape="\\"),
                Transaction.category.ilike(term, escape="\\"),
            )
        )
    if category:
        filters.append(Transaction.category == category)
    if kind == "income":
        filters.append(Transaction.amount > 0)
    elif kind == "expense":
        filters.append(Transaction.amount < 0)
    if from_date is not None:
        filters.append(Transaction.occurred_on >= from_date)
    if to_date is not None:
        filters.append(Transaction.occurred_on <= to_date)
    return filters


def _validate_date_range(from_date: date | None, to_date: date | None) -> None:
    if from_date is not None and to_date is not None and from_date > to_date:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="from_date must be on or before to_date.",
        )


def _as_money(value: object) -> Decimal:
    """Normalise driver-specific numeric results to a 2-decimal Decimal.

    SQLite returns floats for some aggregates; PostgreSQL returns Decimals.
    Keeping the API contract stable avoids client-side precision surprises.
    """
    amount = value if isinstance(value, Decimal) else Decimal(str(value or 0))
    return amount.quantize(Decimal("0.01"))


@router.get("", response_model=TransactionList)
async def list_transactions(
    current_user: CurrentUser,
    db: DbSession,
    response: Response,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0, le=1_000_000)] = 0,
    search: Annotated[str | None, Query(max_length=100)] = None,
    category: Annotated[str | None, Query(max_length=50)] = None,
    kind: TransactionKind | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
    sort: SortOrder = "date_desc",
) -> TransactionList:
    _validate_date_range(from_date, to_date)
    filters = _build_filters(
        user_id=current_user.id,
        search=search,
        category=category,
        kind=kind,
        from_date=from_date,
        to_date=to_date,
    )

    total = (
        await db.execute(select(func.count()).select_from(Transaction).where(*filters))
    ).scalar_one()
    result = await db.scalars(
        select(Transaction)
        .where(*filters)
        .order_by(*_SORT_CLAUSES[sort], Transaction.id.desc())
        .limit(limit)
        .offset(offset)
    )

    response.headers["X-Total-Count"] = str(total)
    return TransactionList(
        items=[TransactionRead.model_validate(item) for item in result],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/summary", response_model=TransactionSummary)
async def summarize_transactions(
    current_user: CurrentUser,
    db: DbSession,
    search: Annotated[str | None, Query(max_length=100)] = None,
    category: Annotated[str | None, Query(max_length=50)] = None,
    kind: TransactionKind | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
) -> TransactionSummary:
    _validate_date_range(from_date, to_date)
    filters = _build_filters(
        user_id=current_user.id,
        search=search,
        category=category,
        kind=kind,
        from_date=from_date,
        to_date=to_date,
    )

    income = func.coalesce(
        func.sum(case((Transaction.amount > 0, Transaction.amount), else_=0)),
        0,
    )
    expenses = func.coalesce(
        func.sum(case((Transaction.amount < 0, -Transaction.amount), else_=0)),
        0,
    )
    row = (
        await db.execute(select(income, expenses, func.count(Transaction.id)).where(*filters))
    ).one()
    income_total = _as_money(row[0])
    expense_total = _as_money(row[1])
    count = int(row[2])

    return TransactionSummary(
        balance=income_total - expense_total,
        income=income_total,
        expenses=expense_total,
        count=count,
        currency=current_user.currency,
    )


@router.get("/categories", response_model=list[str])
async def list_categories(current_user: CurrentUser, db: DbSession) -> list[str]:
    result = await db.scalars(
        select(Transaction.category)
        .where(
            Transaction.user_id == current_user.id,
            Transaction.category.is_not(None),
            Transaction.category != "",
        )
        .distinct()
        .order_by(Transaction.category)
    )
    return [category for category in result if category]


@router.post("", response_model=TransactionRead, status_code=status.HTTP_201_CREATED)
async def create_transaction(
    payload: TransactionCreate,
    current_user: CurrentUser,
    db: DbSession,
    response: Response,
) -> Transaction:
    # user_id is taken from the token, never from the request body.
    transaction = Transaction(**payload.model_dump(), user_id=current_user.id)
    db.add(transaction)
    await db.commit()
    await db.refresh(transaction)
    response.headers["Location"] = f"{router.prefix}/{transaction.id}"
    return transaction


MAX_IMPORT_BYTES = 5 * 1024 * 1024  # 5 MB

DATE_ALIASES = {
    "date",
    "occurred_on",
    "occurred on",
    "transaction date",
    "tx_date",
    "posted",
    "booking date",
}
DESC_ALIASES = {"description", "desc", "memo", "payee", "title", "name", "details", "narrative"}
AMOUNT_ALIASES = {"amount", "total", "sum", "value", "net", "debit/credit"}
CATEGORY_ALIASES = {"category", "tag", "tags", "type", "expense type"}


def _parse_csv_date(raw: str) -> date | None:
    trimmed = raw.strip()
    try:
        return date.fromisoformat(trimmed)
    except ValueError:
        pass

    for fmt in ("%m/%d/%Y", "%d/%m/%Y", "%Y/%m/%d", "%d-%m-%Y", "%m-%d-%Y"):
        try:
            return datetime.strptime(trimmed, fmt).date()
        except ValueError:
            continue
    return None


def _parse_csv_amount(raw: str) -> Decimal | None:
    cleaned = (
        raw.strip()
        .replace("$", "")
        .replace("€", "")
        .replace("£", "")
        .replace("¥", "")
        .replace(",", "")
    )
    try:
        amount = Decimal(cleaned)
        if amount == 0 or abs(amount) > MAX_ABSOLUTE_AMOUNT:
            return None
        return amount.quantize(Decimal("0.01"))
    except Exception:
        return None


@router.get("/export")
async def export_transactions(
    current_user: CurrentUser,
    db: DbSession,
    search: Annotated[str | None, Query(max_length=100)] = None,
    category: Annotated[str | None, Query(max_length=50)] = None,
    kind: TransactionKind | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
    sort: SortOrder = "date_desc",
) -> StreamingResponse:
    _validate_date_range(from_date, to_date)
    filters = _build_filters(
        user_id=current_user.id,
        search=search,
        category=category,
        kind=kind,
        from_date=from_date,
        to_date=to_date,
    )
    result = await db.scalars(
        select(Transaction).where(*filters).order_by(*_SORT_CLAUSES[sort], Transaction.id.desc())
    )

    output = io.StringIO()
    writer = csv.writer(output, lineterminator="\r\n")
    writer.writerow(["Date", "Description", "Amount", "Category"])
    for item in result:
        writer.writerow(
            [
                item.occurred_on.isoformat(),
                item.description,
                f"{item.amount:.2f}",
                item.category or "",
            ]
        )

    csv_data = output.getvalue()
    filename = f"transactions_{date.today().isoformat()}.csv"
    return StreamingResponse(
        iter([csv_data]),
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )


@router.post("/import", response_model=TransactionImportResult)
async def import_transactions(
    current_user: CurrentUser,
    db: DbSession,
    file: Annotated[UploadFile, File(description="CSV file containing transactions")],
) -> TransactionImportResult:
    content = await file.read(MAX_IMPORT_BYTES + 1)
    if len(content) > MAX_IMPORT_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="File size exceeds the 5MB maximum limit.",
        )

    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        try:
            text = content.decode("latin-1")
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Unable to decode file. Please ensure it is a valid CSV formatted file.",
            ) from exc

    f = io.StringIO(text)
    reader = csv.reader(f)

    headers: list[str] | None = None
    for row in reader:
        if any(cell.strip() for cell in row):
            headers = [h.strip().lower() for h in row]
            break

    if not headers:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="The uploaded CSV file is empty.",
        )

    date_idx: int | None = None
    desc_idx: int | None = None
    amount_idx: int | None = None
    cat_idx: int | None = None

    for i, h in enumerate(headers):
        if h in DATE_ALIASES and date_idx is None:
            date_idx = i
        elif h in DESC_ALIASES and desc_idx is None:
            desc_idx = i
        elif h in AMOUNT_ALIASES and amount_idx is None:
            amount_idx = i
        elif h in CATEGORY_ALIASES and cat_idx is None:
            cat_idx = i

    missing: list[str] = []
    if date_idx is None:
        missing.append("Date")
    if desc_idx is None:
        missing.append("Description")
    if amount_idx is None:
        missing.append("Amount")

    if missing or date_idx is None or desc_idx is None or amount_idx is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"CSV is missing required columns: {', '.join(missing)}.",
        )

    to_insert: list[Transaction] = []
    skipped = 0
    errors: list[str] = []
    row_num = 1

    for row in reader:
        row_num += 1
        if not any(cell.strip() for cell in row):
            skipped += 1
            continue

        if len(row) <= max(date_idx, desc_idx, amount_idx):
            errors.append(f"Row {row_num}: Missing required columns.")
            continue

        raw_date = row[date_idx].strip()
        raw_desc = row[desc_idx].strip()
        raw_amount = row[amount_idx].strip()
        raw_cat = row[cat_idx].strip() if cat_idx is not None and len(row) > cat_idx else None

        parsed_date = _parse_csv_date(raw_date)
        if parsed_date is None:
            errors.append(f"Row {row_num}: Invalid date '{raw_date}'.")
            continue

        if not raw_desc or len(raw_desc) > 200:
            errors.append(f"Row {row_num}: Description must be between 1 and 200 characters.")
            continue

        parsed_amount = _parse_csv_amount(raw_amount)
        if parsed_amount is None:
            errors.append(f"Row {row_num}: Invalid amount '{raw_amount}'.")
            continue

        parsed_cat = raw_cat[:50] if raw_cat else None

        to_insert.append(
            Transaction(
                user_id=current_user.id,
                description=raw_desc,
                amount=parsed_amount,
                category=parsed_cat,
                occurred_on=parsed_date,
            )
        )

    if to_insert:
        db.add_all(to_insert)
        await db.commit()

    return TransactionImportResult(
        imported=len(to_insert),
        skipped=skipped,
        errors=errors[:50],
    )


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
