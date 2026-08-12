"""support conversations and deterministic feedback backfill

Revision ID: c2d3e4f5a6b7
Revises: c9d0e1f2a3b4
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "c2d3e4f5a6b7"
down_revision = "c9d0e1f2a3b4"
branch_labels = None
depends_on = None


def upgrade():
    conversation_status = postgresql.ENUM("open", "resolved", name="support_conversation_status")
    sender_type = postgresql.ENUM("user", "admin", name="support_sender_type")
    op.create_table("support_conversations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", conversation_status, nullable=False, server_default="open"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False), sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_message_at", sa.DateTime(timezone=True), nullable=False), sa.Column("last_user_message_at", sa.DateTime(timezone=True)),
        sa.Column("last_admin_message_at", sa.DateTime(timezone=True)), sa.Column("user_unread_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("admin_unread_count", sa.Integer(), nullable=False, server_default="0"), sa.Column("resolved_at", sa.DateTime(timezone=True)),
        sa.Column("resolved_by_admin_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.UniqueConstraint("user_id", name="uq_support_conversation_user"),
        sa.CheckConstraint("user_unread_count >= 0", name="ck_support_conversation_user_unread_nonnegative"),
        sa.CheckConstraint("admin_unread_count >= 0", name="ck_support_conversation_admin_unread_nonnegative"),
        sa.CheckConstraint("(status = 'resolved' AND resolved_at IS NOT NULL AND resolved_by_admin_id IS NOT NULL) OR (status = 'open' AND resolved_at IS NULL AND resolved_by_admin_id IS NULL)", name="ck_support_conversation_resolution_consistent"))
    op.create_index("ix_support_conversations_last_message_at", "support_conversations", ["last_message_at"])
    op.create_index("ix_support_conversations_status_activity", "support_conversations", ["status", "last_message_at"])
    op.create_index("ix_support_conversations_admin_unread_activity", "support_conversations", ["admin_unread_count", "last_message_at"])
    op.create_table("support_messages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True), sa.Column("conversation_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("support_conversations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("sender_type", sender_type, nullable=False), sa.Column("sender_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("sender_admin_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")), sa.Column("body", sa.Text(), nullable=False),
        sa.Column("client_message_id", postgresql.UUID(as_uuid=True), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("user_read_at", sa.DateTime(timezone=True)), sa.Column("admin_read_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("conversation_id", "client_message_id", name="uq_support_message_client_id"),
        sa.CheckConstraint("char_length(btrim(body)) BETWEEN 1 AND 5000", name="ck_support_message_body_length"),
        sa.CheckConstraint("(sender_type = 'user' AND sender_user_id IS NOT NULL AND sender_admin_id IS NULL) OR (sender_type = 'admin' AND sender_admin_id IS NOT NULL AND sender_user_id IS NULL)", name="ck_support_message_sender_integrity"))
    op.create_index("ix_support_messages_conversation_created", "support_messages", ["conversation_id", "created_at"])
    op.create_index("ix_support_messages_conversation_created_id", "support_messages", ["conversation_id", "created_at", "id"])
    op.execute(sa.text("""DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM feedbacks f LEFT JOIN users u ON u.id=f.user_id WHERE u.id IS NULL) THEN
        RAISE EXCEPTION 'Cannot backfill feedback rows with missing users';
      END IF;
    END $$"""))
    # Stable UUID-shaped MD5 values plus conflict handling make the backfill rerunnable;
    # legacy rows remain untouched.
    op.execute(sa.text("""INSERT INTO support_conversations (id,user_id,status,created_at,updated_at,last_message_at,last_user_message_at,admin_unread_count,user_unread_count)
      SELECT md5('mindflip-support:' || user_id::text)::uuid, user_id, 'open', min(created_at), max(updated_at), max(created_at), max(created_at), count(*)::int, 0
      FROM feedbacks GROUP BY user_id ON CONFLICT (user_id) DO NOTHING"""))
    op.execute(sa.text("""INSERT INTO support_messages (id,conversation_id,sender_type,sender_user_id,body,client_message_id,created_at)
      SELECT f.id, c.id, 'user', f.user_id, f.content, f.id, f.created_at FROM feedbacks f JOIN support_conversations c ON c.user_id=f.user_id
      ON CONFLICT (conversation_id,client_message_id) DO NOTHING"""))


def downgrade():
    op.drop_index("ix_support_messages_conversation_created_id", table_name="support_messages"); op.drop_index("ix_support_messages_conversation_created", table_name="support_messages"); op.drop_table("support_messages")
    op.drop_index("ix_support_conversations_admin_unread_activity", table_name="support_conversations"); op.drop_index("ix_support_conversations_status_activity", table_name="support_conversations"); op.drop_index("ix_support_conversations_last_message_at", table_name="support_conversations"); op.drop_table("support_conversations")
    op.execute("DROP TYPE IF EXISTS support_sender_type"); op.execute("DROP TYPE IF EXISTS support_conversation_status")
