"""persist contextual nudge state

Revision ID: a4b5c6d7e8f9
Revises: z3a4b5c6d7e8
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "a4b5c6d7e8f9"
down_revision: Union[str, Sequence[str], None] = "z3a4b5c6d7e8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "nudge_states",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("nudge_key", sa.String(128), nullable=False),
        sa.Column("placement", sa.String(64), nullable=False),
        sa.Column("first_eligible_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_shown_at", sa.DateTime(timezone=True)),
        sa.Column("last_clicked_at", sa.DateTime(timezone=True)),
        sa.Column("dismissed_at", sa.DateTime(timezone=True)),
        sa.Column("converted_at", sa.DateTime(timezone=True)),
        sa.Column("cooldown_until", sa.DateTime(timezone=True)),
        sa.Column("expires_at", sa.DateTime(timezone=True)),
        sa.Column("impression_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("context", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", "nudge_key", name="uq_nudge_states_user_key"),
    )
    op.create_index("ix_nudge_states_user_placement", "nudge_states", ["user_id", "placement"])


def downgrade() -> None:
    op.drop_table("nudge_states")
