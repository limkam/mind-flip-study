"""Enforce one local row per Stripe subscription.

Revision ID: d6e7f8g9h0i1
Revises: c5d6e7f8g9h0
"""

from alembic import op

revision = "d6e7f8g9h0i1"
down_revision = "c5d6e7f8g9h0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_unique_constraint(
        "uq_user_subscriptions_stripe_subscription_id",
        "user_subscriptions",
        ["stripe_subscription_id"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_user_subscriptions_stripe_subscription_id",
        "user_subscriptions",
        type_="unique",
    )
