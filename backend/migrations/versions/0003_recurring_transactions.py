"""Add recurring_transactions table.

Revision ID: 0003_recurring_transactions
Revises: 0002_budgets
Create Date: 2026-11-23

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0003_recurring_transactions"
down_revision: str | None = "0002_budgets"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "recurring_transactions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("description", sa.String(length=200), nullable=False),
        sa.Column("amount", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("category", sa.String(length=50), nullable=True),
        sa.Column("frequency", sa.String(length=20), server_default="monthly", nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("next_date", sa.Date(), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_recurring_transactions_user_id", "recurring_transactions", ["user_id"])
    op.create_index(
        "ix_recurring_transactions_user_next_date",
        "recurring_transactions",
        ["user_id", "next_date"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_recurring_transactions_user_next_date",
        table_name="recurring_transactions",
    )
    op.drop_index("ix_recurring_transactions_user_id", table_name="recurring_transactions")
    op.drop_table("recurring_transactions")
