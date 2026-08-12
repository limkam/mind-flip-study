"""Add append-only feature usage events.

Revision ID: e4f5a6b7c8d9
Revises: d3e4f5a6b7c8
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "e4f5a6b7c8d9"
down_revision: Union[str, None] = "d3e4f5a6b7c8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "usage_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column("resource_type", sa.String(length=32), nullable=False),
        sa.Column("resource_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("billing_period_start", sa.DateTime(timezone=True), nullable=True),
        sa.Column("idempotency_key", sa.String(length=255), nullable=False),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("quantity > 0", name="ck_usage_events_quantity_positive"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("idempotency_key"),
    )
    op.create_index("ix_usage_events_user_id", "usage_events", ["user_id"])
    op.create_index("ix_usage_events_event_type", "usage_events", ["event_type"])
    op.create_index("ix_usage_events_created_at", "usage_events", ["created_at"])
    op.create_index("ix_usage_events_user_type_created", "usage_events", ["user_id", "event_type", "created_at"])
    op.create_index("ix_usage_events_billing_period_start", "usage_events", ["billing_period_start"])
    op.create_index("ix_usage_events_resource", "usage_events", ["resource_type", "resource_id"])
    op.create_table(
        "usage_reservations",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column("operation_key", sa.String(length=255), nullable=False),
        sa.Column("task_id", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("operation_key"),
        sa.UniqueConstraint("task_id"),
    )
    op.create_index("ix_usage_reservations_user_id", "usage_reservations", ["user_id"])
    op.create_index("ix_usage_reservations_event_type", "usage_reservations", ["event_type"])
    op.create_index("ix_usage_reservations_created_at", "usage_reservations", ["created_at"])

    # Accurate lower-bound baseline: only content that still exists at cutover.
    # Previously deleted resources cannot be reconstructed and are intentionally not invented.
    op.execute(sa.text("""
        INSERT INTO usage_events
            (id, user_id, event_type, resource_type, resource_id, quantity,
             billing_period_start, idempotency_key, metadata, created_at)
        SELECT gen_random_uuid(), user_id, 'book_uploaded', 'book', id, 1,
               date_trunc('month', created_at), 'legacy:book:' || id::text,
               '{"source":"live_content_cutover"}'::jsonb, created_at
        FROM books
    """))
    op.execute(sa.text("""
        INSERT INTO usage_events
            (id, user_id, event_type, resource_type, resource_id, quantity,
             billing_period_start, idempotency_key, metadata, created_at)
        SELECT gen_random_uuid(), user_id, 'flashcards_generated', 'flashcard_set', id, 1,
               date_trunc('month', created_at), 'legacy:flashcard_set:' || id::text,
               '{"source":"live_content_cutover"}'::jsonb, created_at
        FROM flashcard_sets
    """))


def downgrade() -> None:
    op.drop_table("usage_reservations")
    op.drop_table("usage_events")
