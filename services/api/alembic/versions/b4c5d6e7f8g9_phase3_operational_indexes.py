"""Phase 3 operational retention and retry indexes.

Revision ID: b4c5d6e7f8g9
Revises: a3b4c5d6e7f8
"""

from alembic import op

revision = "b4c5d6e7f8g9"
down_revision = "a3b4c5d6e7f8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index("ix_nudge_states_cleanup", "nudge_states", ["expires_at"])
    op.create_index("ix_email_delivery_logs_cleanup", "email_delivery_logs", ["created_at"])
    op.create_index("ix_email_jobs_cleanup", "email_jobs", ["status", "updated_at"])
    op.create_index(
        "ix_email_jobs_retry_due",
        "email_jobs",
        ["status", "retry_count", "next_attempt_at", "priority"],
    )


def downgrade() -> None:
    op.drop_index("ix_email_jobs_retry_due", table_name="email_jobs")
    op.drop_index("ix_email_jobs_cleanup", table_name="email_jobs")
    op.drop_index("ix_email_delivery_logs_cleanup", table_name="email_delivery_logs")
    op.drop_index("ix_nudge_states_cleanup", table_name="nudge_states")
