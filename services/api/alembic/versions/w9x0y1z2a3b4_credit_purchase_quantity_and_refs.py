"""Create/upgrade credit_purchases for quantity-based purchases and Stripe reconciliation.

Revision ID: w9x0y1z2a3b4
Revises: a1b2c3d4e5f6
Create Date: 2026-07-22
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "w9x0y1z2a3b4"
down_revision: Union[str, Sequence[str], None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_column(columns: set[str], name: str) -> bool:
    return name in columns


def _column_names(insp: sa.Inspector, table: str) -> set[str]:
    return {c["name"] for c in insp.get_columns(table)}


def _has_index(insp: sa.Inspector, table: str, index_name: str) -> bool:
    return any(ix.get("name") == index_name for ix in insp.get_indexes(table))


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = set(insp.get_table_names())

    if "credit_purchases" not in tables:
        op.create_table(
            "credit_purchases",
            sa.Column("id", sa.UUID(), primary_key=True),
            sa.Column("user_id", sa.UUID(), nullable=False),
            sa.Column("quantity", sa.Integer(), nullable=False),
            sa.Column("amount_paid_cents", sa.Integer(), nullable=False),
            sa.Column("currency", sa.String(length=8), nullable=False, server_default="usd"),
            sa.Column("unit_price_cents", sa.Integer(), nullable=False),
            sa.Column("stripe_event_id", sa.String(length=255), nullable=True),
            sa.Column("stripe_session_id", sa.String(length=255), nullable=True),
            sa.Column("stripe_payment_intent_id", sa.String(length=255), nullable=True),
            sa.Column("stripe_customer_id", sa.String(length=255), nullable=True),
            sa.Column("stripe_invoice_id", sa.String(length=255), nullable=True),
            sa.Column("stripe_charge_id", sa.String(length=255), nullable=True),
            sa.Column("status", sa.String(length=50), nullable=False, server_default="completed"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
            sa.Column("notes", sa.Text(), nullable=True),
        )
        op.create_index("ix_credit_purchases_user_id", "credit_purchases", ["user_id"])
        op.create_index("ix_credit_purchases_created_at", "credit_purchases", ["created_at"])
        op.create_index(
            "ux_credit_purchases_stripe_session_id",
            "credit_purchases",
            ["stripe_session_id"],
            unique=True,
            postgresql_where=sa.text("stripe_session_id IS NOT NULL"),
        )
        return

    cols = _column_names(insp, "credit_purchases")

    if not _has_column(cols, "quantity"):
        op.add_column("credit_purchases", sa.Column("quantity", sa.Integer(), nullable=True))
        if _has_column(cols, "credits_amount"):
            op.execute("UPDATE credit_purchases SET quantity = COALESCE(credits_amount, 0) WHERE quantity IS NULL")
        else:
            op.execute("UPDATE credit_purchases SET quantity = 0 WHERE quantity IS NULL")
        op.alter_column("credit_purchases", "quantity", nullable=False)

    if not _has_column(cols, "amount_paid_cents"):
        op.add_column("credit_purchases", sa.Column("amount_paid_cents", sa.Integer(), nullable=True))
        if _has_column(cols, "amount_paid"):
            op.execute(
                "UPDATE credit_purchases SET amount_paid_cents = COALESCE(ROUND(amount_paid * 100), 0)::int "
                "WHERE amount_paid_cents IS NULL"
            )
        else:
            op.execute("UPDATE credit_purchases SET amount_paid_cents = 0 WHERE amount_paid_cents IS NULL")
        op.alter_column("credit_purchases", "amount_paid_cents", nullable=False)

    if not _has_column(cols, "currency"):
        op.add_column("credit_purchases", sa.Column("currency", sa.String(length=8), nullable=False, server_default="usd"))

    if not _has_column(cols, "unit_price_cents"):
        op.add_column("credit_purchases", sa.Column("unit_price_cents", sa.Integer(), nullable=True))
        op.execute(
            "UPDATE credit_purchases SET unit_price_cents = "
            "CASE WHEN quantity > 0 THEN COALESCE(amount_paid_cents, 0) / quantity ELSE 0 END "
            "WHERE unit_price_cents IS NULL"
        )
        op.alter_column("credit_purchases", "unit_price_cents", nullable=False)

    if not _has_column(cols, "stripe_event_id"):
        op.add_column("credit_purchases", sa.Column("stripe_event_id", sa.String(length=255), nullable=True))
    if not _has_column(cols, "stripe_session_id"):
        op.add_column("credit_purchases", sa.Column("stripe_session_id", sa.String(length=255), nullable=True))
    if not _has_column(cols, "stripe_payment_intent_id"):
        op.add_column("credit_purchases", sa.Column("stripe_payment_intent_id", sa.String(length=255), nullable=True))
    if not _has_column(cols, "stripe_customer_id"):
        op.add_column("credit_purchases", sa.Column("stripe_customer_id", sa.String(length=255), nullable=True))
    if not _has_column(cols, "stripe_invoice_id"):
        op.add_column("credit_purchases", sa.Column("stripe_invoice_id", sa.String(length=255), nullable=True))
    if not _has_column(cols, "stripe_charge_id"):
        op.add_column("credit_purchases", sa.Column("stripe_charge_id", sa.String(length=255), nullable=True))

    if not _has_column(cols, "created_at"):
        op.add_column(
            "credit_purchases",
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        )

    if not _has_column(cols, "status"):
        op.add_column("credit_purchases", sa.Column("status", sa.String(length=50), nullable=False, server_default="completed"))

    if not _has_column(cols, "notes"):
        op.add_column("credit_purchases", sa.Column("notes", sa.Text(), nullable=True))

    # Defensive idempotency + query performance
    if not _has_index(insp, "credit_purchases", "ix_credit_purchases_user_id"):
        op.create_index("ix_credit_purchases_user_id", "credit_purchases", ["user_id"])
    if not _has_index(insp, "credit_purchases", "ix_credit_purchases_created_at"):
        op.create_index("ix_credit_purchases_created_at", "credit_purchases", ["created_at"])
    if not _has_index(insp, "credit_purchases", "ux_credit_purchases_stripe_session_id"):
        op.create_index(
            "ux_credit_purchases_stripe_session_id",
            "credit_purchases",
            ["stripe_session_id"],
            unique=True,
            postgresql_where=sa.text("stripe_session_id IS NOT NULL"),
        )


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = set(insp.get_table_names())
    if "credit_purchases" not in tables:
        return

    if _has_index(insp, "credit_purchases", "ux_credit_purchases_stripe_session_id"):
        op.drop_index("ux_credit_purchases_stripe_session_id", table_name="credit_purchases")
    if _has_index(insp, "credit_purchases", "ix_credit_purchases_created_at"):
        op.drop_index("ix_credit_purchases_created_at", table_name="credit_purchases")
    if _has_index(insp, "credit_purchases", "ix_credit_purchases_user_id"):
        op.drop_index("ix_credit_purchases_user_id", table_name="credit_purchases")

    cols = _column_names(insp, "credit_purchases")
    for col in (
        "stripe_charge_id",
        "stripe_invoice_id",
        "stripe_customer_id",
        "stripe_event_id",
        "unit_price_cents",
        "currency",
        "amount_paid_cents",
        "quantity",
    ):
        if _has_column(cols, col):
            op.drop_column("credit_purchases", col)
