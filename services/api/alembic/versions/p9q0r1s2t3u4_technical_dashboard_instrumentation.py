"""Technical dashboard instrumentation: book processing timestamp, native session app
version readiness, system_security_events table.

Revision ID: p9q0r1s2t3u4
Revises: o8p9q0r1s2t3
Create Date: 2026-08-19
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "p9q0r1s2t3u4"
down_revision: Union[str, None] = "o8p9q0r1s2t3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("books", sa.Column("processing_completed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("native_refresh_sessions", sa.Column("app_version", sa.String(length=32), nullable=True))
    op.create_table(
        "system_security_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("event_type", sa.String(length=32), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("ip_address", sa.String(length=45), nullable=True),
        sa.Column("detail", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_system_security_events_type_created", "system_security_events", ["event_type", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_system_security_events_type_created", table_name="system_security_events")
    op.drop_table("system_security_events")
    op.drop_column("native_refresh_sessions", "app_version")
    op.drop_column("books", "processing_completed_at")
