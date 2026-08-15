"""Admin control center canonical observability foundation.

Revision ID: g6h7i8j9k0l1
Revises: f5a6b7c8d9e0
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "g6h7i8j9k0l1"
down_revision = "f5a6b7c8d9e0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("onboarding_started_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("onboarding_completed_at", sa.DateTime(timezone=True), nullable=True))
    for name, type_ in (
        ("subscription_started_at", sa.DateTime(timezone=True)),
        ("current_period_start", sa.DateTime(timezone=True)),
        ("cancel_at", sa.DateTime(timezone=True)),
        ("canceled_at", sa.DateTime(timezone=True)),
        ("trial_start", sa.DateTime(timezone=True)),
        ("trial_end", sa.DateTime(timezone=True)),
        ("pause_collection", postgresql.JSONB()),
    ):
        op.add_column("user_subscriptions", sa.Column(name, type_, nullable=True))
    op.add_column("user_subscriptions", sa.Column("cancel_at_period_end", sa.Boolean(), server_default=sa.text("false"), nullable=False))
    op.create_index("ix_user_subscriptions_status_period_user", "user_subscriptions", ["status", "current_period_end", "user_id"])

    op.create_table(
        "admin_audit_logs",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("admin_user_id", sa.UUID(), nullable=True),
        sa.Column("admin_email", sa.String(255), nullable=False),
        sa.Column("action", sa.String(96), nullable=False),
        sa.Column("target_resource_type", sa.String(64), nullable=False),
        sa.Column("target_resource_id", sa.String(255), nullable=True),
        sa.Column("affected_user_id", sa.UUID(), nullable=True),
        sa.Column("request_id", sa.String(64), nullable=True),
        sa.Column("previous_value", postgresql.JSONB(), nullable=True),
        sa.Column("new_value", postgresql.JSONB(), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("metadata", postgresql.JSONB(), nullable=True),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["admin_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["affected_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_admin_audit_created", "admin_audit_logs", ["created_at", "id"])
    op.create_index("ix_admin_audit_admin_created", "admin_audit_logs", ["admin_user_id", "created_at"])
    op.create_index("ix_admin_audit_action_created", "admin_audit_logs", ["action", "created_at"])
    op.create_index("ix_admin_audit_resource", "admin_audit_logs", ["target_resource_type", "target_resource_id"])

    op.create_table(
        "user_activity_events",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("activity_key", sa.String(64), nullable=False),
        sa.Column("platform", sa.String(16), nullable=False),
        sa.Column("bucket_started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("metadata", postgresql.JSONB(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "activity_key", "bucket_started_at", name="uq_user_activity_throttle"),
    )
    op.create_index("ix_user_activity_occurred_user", "user_activity_events", ["occurred_at", "user_id"])
    op.create_index("ix_user_activity_user_occurred", "user_activity_events", ["user_id", "occurred_at"])

    op.create_table(
        "onboarding_events",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("event_type", sa.String(32), nullable=False),
        sa.Column("step", sa.String(64), server_default="", nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "event_type", "step", name="uq_onboarding_user_event_step"),
    )
    op.create_index("ix_onboarding_events_occurred", "onboarding_events", ["occurred_at"])


def downgrade() -> None:
    op.drop_table("onboarding_events")
    op.drop_table("user_activity_events")
    op.drop_table("admin_audit_logs")
    op.drop_index("ix_user_subscriptions_status_period_user", table_name="user_subscriptions")
    for name in ("cancel_at_period_end", "pause_collection", "trial_end", "trial_start", "canceled_at", "cancel_at", "current_period_start", "subscription_started_at"):
        op.drop_column("user_subscriptions", name)
    op.drop_column("users", "onboarding_completed_at")
    op.drop_column("users", "onboarding_started_at")
