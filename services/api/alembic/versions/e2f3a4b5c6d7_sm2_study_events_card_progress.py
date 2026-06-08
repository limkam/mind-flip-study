"""SM-2: card_progress repetitions + next_review_date, study_events

Revision ID: e2f3a4b5c6d7
Revises: d1e2f3a4b5c6
Create Date: 2026-05-12

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "e2f3a4b5c6d7"
down_revision: Union[str, Sequence[str], None] = "d1e2f3a4b5c6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "card_progress",
        sa.Column("repetitions", sa.Integer(), server_default="0", nullable=False),
    )
    op.execute(sa.text("ALTER TABLE card_progress RENAME COLUMN due_date TO next_review_date"))
    op.alter_column("card_progress", "next_review_date", existing_type=sa.Date(), nullable=True)
    op.drop_index("ix_card_progress_due_date", table_name="card_progress")
    op.execute(
        sa.text(
            "CREATE INDEX idx_card_progress_due ON card_progress (user_id, next_review_date) "
            "WHERE next_review_date IS NOT NULL"
        )
    )
    op.create_table(
        "study_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("card_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("set_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column("quality", sa.Integer(), nullable=True),
        sa.Column("score", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["card_id"], ["flashcards.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["set_id"], ["flashcard_sets.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_study_events_user_id", "study_events", ["user_id"], unique=False)
    op.create_index("ix_study_events_created_at", "study_events", ["created_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_study_events_created_at", table_name="study_events")
    op.drop_index("ix_study_events_user_id", table_name="study_events")
    op.drop_table("study_events")
    op.execute(sa.text("DROP INDEX IF EXISTS idx_card_progress_due"))
    op.execute(sa.text("UPDATE card_progress SET next_review_date = CURRENT_DATE WHERE next_review_date IS NULL"))
    op.alter_column("card_progress", "next_review_date", existing_type=sa.Date(), nullable=False)
    op.execute(sa.text("ALTER TABLE card_progress RENAME COLUMN next_review_date TO due_date"))
    op.create_index("ix_card_progress_due_date", "card_progress", ["due_date"], unique=False)
    op.drop_column("card_progress", "repetitions")
