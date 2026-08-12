"""Persist Stripe-hosted receipt links for one-time credit purchases."""

from alembic import op
import sqlalchemy as sa


revision = "c9d0e1f2a3b4"
down_revision = "b8c9d0e1f2a3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("credit_purchases", sa.Column("receipt_url", sa.String(length=2048), nullable=True))


def downgrade() -> None:
    op.drop_column("credit_purchases", "receipt_url")
