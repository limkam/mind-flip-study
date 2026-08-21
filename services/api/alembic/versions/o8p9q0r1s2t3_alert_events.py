"""Create alert_events (Module 8 threshold breach log).

Revision ID: o8p9q0r1s2t3
Revises: n7o8p9q0r1s2
Create Date: 2026-08-19
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "o8p9q0r1s2t3"
down_revision: Union[str, None] = "n7o8p9q0r1s2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "alert_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("metric_key", sa.String(length=64), nullable=False),
        sa.Column("severity", sa.String(length=16), nullable=False, server_default="warning"),
        sa.Column("value", sa.Float(), nullable=False),
        sa.Column("threshold", sa.Float(), nullable=False),
        sa.Column("message", sa.String(length=512), nullable=False),
        sa.Column("triggered_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_alert_events_metric_key", "alert_events", ["metric_key"])
    op.create_index("ix_alert_events_metric_triggered", "alert_events", ["metric_key", "triggered_at"])


def downgrade() -> None:
    op.drop_index("ix_alert_events_metric_triggered", table_name="alert_events")
    op.drop_index("ix_alert_events_metric_key", table_name="alert_events")
    op.drop_table("alert_events")
