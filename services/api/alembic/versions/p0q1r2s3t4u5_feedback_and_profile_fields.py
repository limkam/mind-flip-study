"""Feedback table and user profile columns (job_title, custom_country)

Revision ID: p0q1r2s3t4u5
Revises: o9p0q1r2s3t4
Create Date: 2026-06-08

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "p0q1r2s3t4u5"
down_revision: Union[str, Sequence[str], None] = "o9p0q1r2s3t4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("custom_country", sa.String(length=128), nullable=True))
    op.add_column("users", sa.Column("job_title", sa.String(length=100), nullable=True))

    feedback_status = postgresql.ENUM(
        "pending",
        "reviewed",
        "resolved",
        name="feedback_status",
        create_type=False,
    )
    feedback_status.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "feedbacks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("category", sa.String(length=50), nullable=True),
        sa.Column("status", feedback_status, nullable=False, server_default="pending"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_feedbacks_user_id", "feedbacks", ["user_id"])
    op.create_index("ix_feedbacks_status", "feedbacks", ["status"])


def downgrade() -> None:
    op.drop_index("ix_feedbacks_status", table_name="feedbacks")
    op.drop_index("ix_feedbacks_user_id", table_name="feedbacks")
    op.drop_table("feedbacks")
    op.execute(sa.text("DROP TYPE IF EXISTS feedback_status"))
    op.drop_column("users", "job_title")
    op.drop_column("users", "custom_country")
