"""Canonical billing facts and complete AI telemetry.

Revision ID: e7f8g9h0i1j2
Revises: d6e7f8g9h0i1
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "e7f8g9h0i1j2"
down_revision = "d6e7f8g9h0i1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "billing_events",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("stripe_event_id", sa.String(255), nullable=False),
        sa.Column("event_type", sa.String(128), nullable=False),
        sa.Column("status", sa.String(32), nullable=False, server_default="processing"),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("payload", postgresql.JSONB(), nullable=True),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("stripe_event_id"),
    )
    op.create_index("ix_billing_events_stripe_event_id", "billing_events", ["stripe_event_id"], unique=True)
    op.create_index("ix_billing_events_event_type", "billing_events", ["event_type"])
    op.create_index("ix_billing_events_status", "billing_events", ["status"])

    op.create_table(
        "billing_invoices",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("stripe_invoice_id", sa.String(255), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("stripe_customer_id", sa.String(255), nullable=False),
        sa.Column("stripe_subscription_id", sa.String(255), nullable=True),
        sa.Column("stripe_payment_intent_id", sa.String(255), nullable=True),
        sa.Column("plan_slug", sa.String(64), nullable=True),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("currency", sa.String(8), nullable=False, server_default="usd"),
        sa.Column("amount_due_cents", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("amount_paid_cents", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("amount_refunded_cents", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("period_start", sa.DateTime(timezone=True), nullable=True),
        sa.Column("period_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("stripe_invoice_id"),
    )
    for col in ("user_id", "stripe_customer_id", "stripe_subscription_id", "stripe_payment_intent_id", "plan_slug", "status", "paid_at"):
        op.create_index(f"ix_billing_invoices_{col}", "billing_invoices", [col])
    op.create_index("ix_billing_invoices_stripe_invoice_id", "billing_invoices", ["stripe_invoice_id"], unique=True)

    op.add_column("user_subscriptions", sa.Column("stripe_price_id", sa.String(255), nullable=True))
    op.add_column("user_subscriptions", sa.Column("unit_amount_cents", sa.Integer(), nullable=True))
    op.add_column("user_subscriptions", sa.Column("interval_count", sa.Integer(), nullable=False, server_default="1"))
    op.create_foreign_key("fk_user_subscriptions_user", "user_subscriptions", "users", ["user_id"], ["id"], ondelete="CASCADE")
    op.create_foreign_key("fk_user_subscriptions_plan", "user_subscriptions", "plans", ["plan_id"], ["id"], ondelete="RESTRICT")
    op.create_foreign_key("fk_credit_ledger_user", "credit_ledger", "users", ["user_id"], ["id"], ondelete="CASCADE")
    op.create_foreign_key("fk_credit_purchases_user", "credit_purchases", "users", ["user_id"], ["id"], ondelete="CASCADE")

    op.add_column("token_usage", sa.Column("provider", sa.String(32), nullable=False, server_default="anthropic"))
    op.add_column("token_usage", sa.Column("status", sa.String(32), nullable=False, server_default="succeeded"))
    op.add_column("token_usage", sa.Column("error_code", sa.String(128), nullable=True))
    op.add_column("token_usage", sa.Column("error_message", sa.String(1000), nullable=True))
    op.add_column("token_usage", sa.Column("provider_request_id", sa.String(255), nullable=True))
    op.add_column("token_usage", sa.Column("cache_read_tokens", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("token_usage", sa.Column("cache_creation_tokens", sa.Integer(), nullable=False, server_default="0"))
    op.create_index("ix_token_usage_status", "token_usage", ["status"])
    op.create_index("ix_token_usage_provider_request_id", "token_usage", ["provider_request_id"])


def downgrade() -> None:
    op.drop_index("ix_token_usage_provider_request_id", table_name="token_usage")
    op.drop_index("ix_token_usage_status", table_name="token_usage")
    for col in ("cache_creation_tokens", "cache_read_tokens", "provider_request_id", "error_message", "error_code", "status", "provider"):
        op.drop_column("token_usage", col)
    op.drop_constraint("fk_credit_purchases_user", "credit_purchases", type_="foreignkey")
    op.drop_constraint("fk_credit_ledger_user", "credit_ledger", type_="foreignkey")
    op.drop_constraint("fk_user_subscriptions_plan", "user_subscriptions", type_="foreignkey")
    op.drop_constraint("fk_user_subscriptions_user", "user_subscriptions", type_="foreignkey")
    for col in ("interval_count", "unit_amount_cents", "stripe_price_id"):
        op.drop_column("user_subscriptions", col)
    op.drop_table("billing_invoices")
    op.drop_table("billing_events")
