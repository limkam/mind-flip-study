"""engagement platform foundation

Revision ID: z3a4b5c6d7e8
Revises: y2z3a4b5c6d7
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "z3a4b5c6d7e8"
down_revision: Union[str, Sequence[str], None] = "y2z3a4b5c6d7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table("engagement_events", sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True), sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False), sa.Column("event_type", sa.String(80), nullable=False), sa.Column("source", sa.String(80), nullable=False), sa.Column("entity_type", sa.String(80)), sa.Column("entity_id", sa.String(128)), sa.Column("metadata", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")), sa.Column("idempotency_key", sa.String(255), nullable=False, unique=True), sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()))
    op.create_index("ix_engagement_events_user_occurred", "engagement_events", ["user_id", "occurred_at"])
    op.create_table("engagement_preferences", sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True), sa.Column("in_app_enabled", sa.Boolean(), nullable=False, server_default=sa.true()), sa.Column("learning_reminders", sa.Boolean(), nullable=False, server_default=sa.true()), sa.Column("streak_reminders", sa.Boolean(), nullable=False, server_default=sa.true()), sa.Column("weekly_summaries", sa.Boolean(), nullable=False, server_default=sa.true()), sa.Column("achievement_announcements", sa.Boolean(), nullable=False, server_default=sa.true()), sa.Column("marketing_emails", sa.Boolean(), nullable=False, server_default=sa.false()), sa.Column("celebration_animations", sa.Boolean(), nullable=False, server_default=sa.true()), sa.Column("achievement_sounds", sa.Boolean(), nullable=False, server_default=sa.false()), sa.Column("streak_sounds", sa.Boolean(), nullable=False, server_default=sa.false()), sa.Column("quiet_hours_start", sa.String(5)), sa.Column("quiet_hours_end", sa.String(5)), sa.Column("timezone", sa.String(64), nullable=False, server_default="UTC"), sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()))
    op.create_table("learning_streaks", sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True), sa.Column("current_streak", sa.Integer(), nullable=False, server_default="0"), sa.Column("longest_streak", sa.Integer(), nullable=False, server_default="0"), sa.Column("last_qualifying_activity_at", sa.DateTime(timezone=True)), sa.Column("last_qualifying_local_date", sa.Date()), sa.Column("streak_started_at", sa.DateTime(timezone=True)), sa.Column("streak_timezone", sa.String(64), nullable=False, server_default="UTC"), sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()))
    op.create_table("notifications", sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True), sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False), sa.Column("event_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("engagement_events.id", ondelete="SET NULL")), sa.Column("type", sa.String(80), nullable=False), sa.Column("category", sa.String(40), nullable=False), sa.Column("title", sa.String(180), nullable=False), sa.Column("body", sa.Text(), nullable=False), sa.Column("action_label", sa.String(80)), sa.Column("action_url", sa.String(512)), sa.Column("icon", sa.String(80)), sa.Column("metadata", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")), sa.Column("idempotency_key", sa.String(255), nullable=False, unique=True), sa.Column("seen_at", sa.DateTime(timezone=True)), sa.Column("read_at", sa.DateTime(timezone=True)), sa.Column("dismissed_at", sa.DateTime(timezone=True)), sa.Column("expires_at", sa.DateTime(timezone=True)), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()), sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()))
    op.create_index("ix_notifications_user_created", "notifications", ["user_id", "created_at"])
    op.create_index("ix_notifications_user_unread", "notifications", ["user_id", "read_at"])
    op.create_table("scorecards", sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True), sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False), sa.Column("period_type", sa.String(24), nullable=False), sa.Column("period_start", sa.Date(), nullable=False), sa.Column("period_end", sa.Date(), nullable=False), sa.Column("score", sa.Integer(), nullable=False), sa.Column("formula_version", sa.String(24), nullable=False, server_default="v1"), sa.Column("metrics", postgresql.JSONB(), nullable=False), sa.Column("visibility", sa.String(24), nullable=False, server_default="private"), sa.Column("public_share_token", sa.String(64), nullable=False, unique=True), sa.Column("revoked_at", sa.DateTime(timezone=True)), sa.Column("expires_at", sa.DateTime(timezone=True)), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()), sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()), sa.UniqueConstraint("user_id", "period_type", "period_start", "period_end", name="uq_scorecards_period"))
    op.create_index("ix_scorecards_user_period", "scorecards", ["user_id", "period_start"])
    op.execute(sa.text("""DELETE FROM achievements WHERE id IN (SELECT id FROM (SELECT id, row_number() OVER (PARTITION BY user_id, achievement_type ORDER BY earned_at, id) AS rn FROM achievements) ranked WHERE rn > 1)"""))
    op.create_unique_constraint("uq_achievements_user_type", "achievements", ["user_id", "achievement_type"])


def downgrade() -> None:
    op.drop_constraint("uq_achievements_user_type", "achievements", type_="unique")
    op.drop_table("scorecards")
    op.drop_table("notifications")
    op.drop_table("learning_streaks")
    op.drop_table("engagement_preferences")
    op.drop_table("engagement_events")
