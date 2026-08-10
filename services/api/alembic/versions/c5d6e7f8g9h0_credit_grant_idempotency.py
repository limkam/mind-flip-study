"""Add unique idempotency keys for credit ledger grants.

Revision ID: c5d6e7f8g9h0
Revises: b4c5d6e7f8g9
"""

from alembic import op
import sqlalchemy as sa

revision = "c5d6e7f8g9h0"
down_revision = "b4c5d6e7f8g9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("credit_ledger", sa.Column("idempotency_key", sa.String(length=255), nullable=True))
    op.create_unique_constraint("uq_credit_ledger_idempotency_key", "credit_ledger", ["idempotency_key"])


def downgrade() -> None:
    op.drop_constraint("uq_credit_ledger_idempotency_key", "credit_ledger", type_="unique")
    op.drop_column("credit_ledger", "idempotency_key")
