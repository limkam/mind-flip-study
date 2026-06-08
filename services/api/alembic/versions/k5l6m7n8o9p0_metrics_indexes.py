"""Indexes for admin metrics queries on study_events and users

Revision ID: k5l6m7n8o9p0
Revises: j4k5l6m7n8o9
Create Date: 2026-05-15

"""

from typing import Sequence, Union

from alembic import op

revision: str = "k5l6m7n8o9p0"
down_revision: Union[str, Sequence[str], None] = "j4k5l6m7n8o9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "ix_study_events_event_type_created_at",
        "study_events",
        ["event_type", "created_at"],
        unique=False,
    )
    op.create_index(
        "ix_study_events_user_id_created_at",
        "study_events",
        ["user_id", "created_at"],
        unique=False,
    )
    op.create_index("ix_users_created_at", "users", ["created_at"], unique=False)
    op.create_index(
        "ix_users_subscription_tier",
        "users",
        ["subscription_tier"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_users_subscription_tier", table_name="users")
    op.drop_index("ix_users_created_at", table_name="users")
    op.drop_index("ix_study_events_user_id_created_at", table_name="study_events")
    op.drop_index("ix_study_events_event_type_created_at", table_name="study_events")
