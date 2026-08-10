"""engagement automation schedules and run history

Revision ID: g7h8i9j0k1l2
Revises: f6g7h8i9j0k1
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "g7h8i9j0k1l2"
down_revision = "f6g7h8i9j0k1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index("ix_email_provider_events_created_at", "email_provider_events", ["created_at"])
    op.create_table(
        "engagement_automation_schedules",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("automation_type", sa.String(40), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="active"),
        sa.Column("next_evaluation_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_evaluated_at", sa.DateTime(timezone=True)),
        sa.Column("last_success_at", sa.DateTime(timezone=True)),
        sa.Column("last_failure_at", sa.DateTime(timezone=True)),
        sa.Column("failure_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("locked_at", sa.DateTime(timezone=True)),
        sa.Column("correlation_id", postgresql.UUID(as_uuid=True)),
        sa.Column(
            "context",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint(
            "user_id", "automation_type", name="uq_automation_schedule_user_type"
        ),
        sa.CheckConstraint(
            "status IN ('active','paused','disabled')",
            name="ck_automation_schedule_status",
        ),
    )
    op.create_index(
        "ix_automation_schedule_due",
        "engagement_automation_schedules",
        ["automation_type", "status", "next_evaluation_at", "id"],
    )
    op.create_index(
        "ix_automation_schedule_failed",
        "engagement_automation_schedules",
        ["failure_count", "last_failure_at"],
    )
    op.create_index(
        "ix_automation_schedule_lease",
        "engagement_automation_schedules",
        ["status", "locked_at"],
    )
    op.create_table(
        "engagement_automation_runs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("automation_type", sa.String(40), nullable=False),
        sa.Column("idempotency_key", sa.String(255), nullable=False, unique=True),
        sa.Column("correlation_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("status", sa.String(32), nullable=False, server_default="running"),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.Column("batch_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("claimed_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("evaluated_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("scheduled_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("suppressed_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("cancelled_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("retried_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("failed_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("skipped_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("remaining_due_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_error_code", sa.String(64)),
        sa.Column("last_error_message", sa.Text()),
        sa.Column("worker_id", sa.String(255)),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index(
        "ix_automation_runs_type_started",
        "engagement_automation_runs",
        ["automation_type", "started_at"],
    )
    op.create_index(
        "ix_automation_runs_cleanup", "engagement_automation_runs", ["completed_at"]
    )


def downgrade() -> None:
    op.drop_table("engagement_automation_runs")
    op.drop_table("engagement_automation_schedules")
    op.execute("DROP INDEX IF EXISTS ix_email_provider_events_created_at")
