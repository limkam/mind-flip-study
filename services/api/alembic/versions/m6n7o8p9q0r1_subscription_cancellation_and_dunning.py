"""Add cancellation reason and dunning retry tracking to user_subscriptions.

Revision ID: m6n7o8p9q0r1
Revises: l5m6n7o8p9q0
Create Date: 2026-08-19
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "m6n7o8p9q0r1"
down_revision: Union[str, None] = "l5m6n7o8p9q0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("user_subscriptions", sa.Column("cancellation_reason", sa.String(length=255), nullable=True))
    op.add_column(
        "user_subscriptions",
        sa.Column("dunning_stage", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "user_subscriptions",
        sa.Column("dunning_attempt_count", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column("user_subscriptions", sa.Column("dunning_last_attempt_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("user_subscriptions", "dunning_last_attempt_at")
    op.drop_column("user_subscriptions", "dunning_attempt_count")
    op.drop_column("user_subscriptions", "dunning_stage")
    op.drop_column("user_subscriptions", "cancellation_reason")
