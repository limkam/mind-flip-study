"""users: Stripe customer id + subscription tier

Revision ID: g2h3i4j5k6l7
Revises: f1e2d3c4b5a6
Create Date: 2026-05-12

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "g2h3i4j5k6l7"
down_revision: Union[str, Sequence[str], None] = "f1e2d3c4b5a6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("stripe_customer_id", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column(
            "subscription_tier",
            sa.String(length=32),
            server_default=sa.text("'free'"),
            nullable=False,
        ),
    )
    # PostgreSQL treats NULLs as distinct — many users may have NULL until checkout.
    op.create_unique_constraint("uq_users_stripe_customer_id", "users", ["stripe_customer_id"])


def downgrade() -> None:
    op.drop_constraint("uq_users_stripe_customer_id", "users", type_="unique")
    op.drop_column("users", "subscription_tier")
    op.drop_column("users", "stripe_customer_id")
