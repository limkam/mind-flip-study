"""token_usage table for Anthropic cost tracking

Revision ID: l6m7n8o9p0q1
Revises: k5l6m7n8o9p0
Create Date: 2026-05-15

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "l6m7n8o9p0q1"
down_revision: Union[str, Sequence[str], None] = "k5l6m7n8o9p0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "token_usage",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("task", sa.String(length=64), nullable=False),
        sa.Column("model", sa.String(length=128), nullable=False),
        sa.Column("input_tokens", sa.Integer(), nullable=False),
        sa.Column("output_tokens", sa.Integer(), nullable=False),
        sa.Column("estimated_cost_usd", sa.Float(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_token_usage_user_id", "token_usage", ["user_id"], unique=False)
    op.create_index("ix_token_usage_created_at", "token_usage", ["created_at"], unique=False)
    op.create_index(
        "ix_token_usage_task_created_at",
        "token_usage",
        ["task", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_token_usage_task_created_at", table_name="token_usage")
    op.drop_index("ix_token_usage_created_at", table_name="token_usage")
    op.drop_index("ix_token_usage_user_id", table_name="token_usage")
    op.drop_table("token_usage")
