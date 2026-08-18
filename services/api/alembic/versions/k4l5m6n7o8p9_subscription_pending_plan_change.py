"""Add pending scheduled-downgrade fields to user_subscriptions.

Revision ID: k4l5m6n7o8p9
Revises: j2k3l4m5n6o7
Create Date: 2026-08-16
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "k4l5m6n7o8p9"
down_revision: Union[str, None] = "j2k3l4m5n6o7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("user_subscriptions", sa.Column("pending_plan_id", sa.UUID(), nullable=True))
    op.add_column("user_subscriptions", sa.Column("pending_price_id", sa.String(length=255), nullable=True))
    op.add_column("user_subscriptions", sa.Column("pending_change_effective_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("user_subscriptions", sa.Column("stripe_schedule_id", sa.String(length=255), nullable=True))
    op.create_foreign_key(
        "fk_user_subscriptions_pending_plan_id",
        "user_subscriptions",
        "plans",
        ["pending_plan_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_user_subscriptions_pending_plan_id", "user_subscriptions", type_="foreignkey")
    op.drop_column("user_subscriptions", "stripe_schedule_id")
    op.drop_column("user_subscriptions", "pending_change_effective_at")
    op.drop_column("user_subscriptions", "pending_price_id")
    op.drop_column("user_subscriptions", "pending_plan_id")
