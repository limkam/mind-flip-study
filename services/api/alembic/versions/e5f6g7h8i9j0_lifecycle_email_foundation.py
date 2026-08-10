"""lifecycle email foundation

Revision ID: e5f6g7h8i9j0
Revises: a4b5c6d7e8f9
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "e5f6g7h8i9j0"
down_revision = "a4b5c6d7e8f9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table("email_jobs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("engagement_event_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("engagement_events.id", ondelete="SET NULL")),
        sa.Column("template_key", sa.String(64), nullable=False), sa.Column("template_version", sa.String(16), nullable=False, server_default="v1"),
        sa.Column("category", sa.String(40), nullable=False), sa.Column("classification", sa.String(24), nullable=False),
        sa.Column("status", sa.String(24), nullable=False, server_default="pending"), sa.Column("priority", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("scheduled_for", sa.DateTime(timezone=True), nullable=False), sa.Column("next_attempt_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("processing_started_at", sa.DateTime(timezone=True)), sa.Column("sent_at", sa.DateTime(timezone=True)),
        sa.Column("cancelled_at", sa.DateTime(timezone=True)), sa.Column("suppressed_at", sa.DateTime(timezone=True)),
        sa.Column("failed_at", sa.DateTime(timezone=True)), sa.Column("expires_at", sa.DateTime(timezone=True)),
        sa.Column("retry_count", sa.Integer(), nullable=False, server_default="0"), sa.Column("max_retries", sa.Integer(), nullable=False, server_default="5"),
        sa.Column("idempotency_key", sa.String(255), nullable=False), sa.Column("deduplication_key", sa.String(255), nullable=False),
        sa.Column("entity_type", sa.String(80)), sa.Column("entity_id", sa.String(128)), sa.Column("provider_message_id", sa.String(255)),
        sa.Column("last_failure_code", sa.String(64)), sa.Column("last_failure_reason", sa.Text()),
        sa.Column("payload", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("correlation_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("status IN ('pending','processing','sent','failed','cancelled','suppressed','dead_letter')", name="ck_email_jobs_status"),
        sa.UniqueConstraint("idempotency_key", name="uq_email_jobs_idempotency"), sa.UniqueConstraint("deduplication_key", name="uq_email_jobs_deduplication"))
    op.create_index("ix_email_jobs_due", "email_jobs", ["status", "next_attempt_at", "priority"])
    op.create_index("ix_email_jobs_user_category", "email_jobs", ["user_id", "category", "created_at"])
    op.create_index("ix_email_jobs_entity_pending", "email_jobs", ["user_id", "entity_type", "entity_id", "status"])
    op.create_index("ix_email_jobs_processing_recovery", "email_jobs", ["status", "processing_started_at"])
    op.create_index("ix_email_jobs_provider_message", "email_jobs", ["provider_message_id"])
    op.create_table("email_delivery_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("email_job_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("email_jobs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("attempt_number", sa.Integer(), nullable=False), sa.Column("event_type", sa.String(40), nullable=False),
        sa.Column("previous_status", sa.String(24)), sa.Column("new_status", sa.String(24)), sa.Column("provider", sa.String(40)),
        sa.Column("provider_message_id", sa.String(255)), sa.Column("retryable", sa.Boolean()), sa.Column("failure_category", sa.String(64)),
        sa.Column("failure_reason", sa.Text()), sa.Column("correlation_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("provider_metadata", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()))
    op.create_index("ix_email_delivery_logs_job_time", "email_delivery_logs", ["email_job_id", "created_at"])
    op.create_table("email_suppressions", sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("scope", sa.String(40), nullable=False, server_default="global"), sa.Column("reason", sa.String(40), nullable=False),
        sa.Column("provider_event_id", sa.String(255)), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", "scope", "reason", name="uq_email_suppressions_user_scope_reason"))
    op.create_table("email_provider_events", sa.Column("provider_event_id", sa.String(255), primary_key=True),
        sa.Column("event_type", sa.String(64), nullable=False),
        sa.Column("email_job_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("email_jobs.id", ondelete="SET NULL")),
        sa.Column("safe_metadata", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()))


def downgrade() -> None:
    op.drop_table("email_provider_events")
    op.drop_table("email_suppressions")
    op.drop_table("email_delivery_logs")
    op.drop_table("email_jobs")
