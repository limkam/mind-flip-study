"""Add AI usage analytics columns to token_usage.

Revision ID: s4t5u6v7w8x9
Revises: r2s3t4u5v6w7
Create Date: 2026-06-12
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "s4t5u6v7w8x9"
down_revision: Union[str, None] = "r2s3t4u5v6w7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("token_usage", sa.Column("cached_tokens", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("token_usage", sa.Column("duration_ms", sa.Integer(), nullable=True))
    op.add_column("token_usage", sa.Column("feature_type", sa.String(length=32), nullable=True))
    op.add_column("token_usage", sa.Column("book_id", sa.UUID(), nullable=True))
    op.add_column("token_usage", sa.Column("celery_task_id", sa.String(length=64), nullable=True))
    op.create_index("ix_token_usage_feature_type", "token_usage", ["feature_type"])
    op.create_index("ix_token_usage_book_id", "token_usage", ["book_id"])
    op.create_foreign_key(
        "fk_token_usage_book_id",
        "token_usage",
        "books",
        ["book_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_token_usage_book_id", "token_usage", type_="foreignkey")
    op.drop_index("ix_token_usage_book_id", "token_usage")
    op.drop_index("ix_token_usage_feature_type", "token_usage")
    op.drop_column("token_usage", "celery_task_id")
    op.drop_column("token_usage", "book_id")
    op.drop_column("token_usage", "feature_type")
    op.drop_column("token_usage", "duration_ms")
    op.drop_column("token_usage", "cached_tokens")
