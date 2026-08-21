"""Create subscription_plan_change_events (Revenue MRR-movement decomposition).

Revision ID: n7o8p9q0r1s2
Revises: m6n7o8p9q0r1
Create Date: 2026-08-19
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "n7o8p9q0r1s2"
down_revision: Union[str, None] = "m6n7o8p9q0r1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "subscription_plan_change_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("subscription_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("user_subscriptions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("old_plan_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("plans.id", ondelete="SET NULL"), nullable=True),
        sa.Column("new_plan_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("plans.id", ondelete="CASCADE"), nullable=False),
        sa.Column("old_mrr_cents", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("new_mrr_cents", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("changed_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_subscription_plan_change_events_user_id", "subscription_plan_change_events", ["user_id"])
    op.create_index("ix_subscription_plan_change_events_subscription_id", "subscription_plan_change_events", ["subscription_id"])
    op.create_index("ix_subscription_plan_change_events_changed_at", "subscription_plan_change_events", ["changed_at"])


def downgrade() -> None:
    op.drop_index("ix_subscription_plan_change_events_changed_at", table_name="subscription_plan_change_events")
    op.drop_index("ix_subscription_plan_change_events_subscription_id", table_name="subscription_plan_change_events")
    op.drop_index("ix_subscription_plan_change_events_user_id", table_name="subscription_plan_change_events")
    op.drop_table("subscription_plan_change_events")
