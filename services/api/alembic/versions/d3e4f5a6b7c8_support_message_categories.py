"""support message categories and historical reconciliation

Revision ID: d3e4f5a6b7c8
Revises: c2d3e4f5a6b7
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "d3e4f5a6b7c8"
down_revision = "c2d3e4f5a6b7"
branch_labels = None
depends_on = None


def upgrade():
    category = postgresql.ENUM("general", "bug_report", "feature_request", "account", "billing", "other", name="support_category")
    category.create(op.get_bind(), checkfirst=True)
    category_ref = postgresql.ENUM("general", "bug_report", "feature_request", "account", "billing", "other", name="support_category", create_type=False)
    op.add_column("support_messages", sa.Column("category", category_ref, nullable=True))
    op.create_index("ix_support_messages_conversation_category_created", "support_messages", ["conversation_id", "category", "created_at"])
    op.execute(sa.text("""DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM feedbacks f LEFT JOIN users u ON u.id=f.user_id WHERE u.id IS NULL) THEN
        RAISE EXCEPTION 'Cannot reconcile feedback rows with missing users';
      END IF;
    END $$"""))
    # Repair databases that were stamped before the original backfill was present.
    op.execute(sa.text("""INSERT INTO support_conversations
      (id,user_id,status,created_at,updated_at,last_message_at,last_user_message_at,admin_unread_count,user_unread_count)
      SELECT md5('bilkeys-support:' || user_id::text)::uuid,user_id,'open',min(created_at),max(updated_at),max(created_at),max(created_at),count(*)::int,0
      FROM feedbacks GROUP BY user_id ON CONFLICT (user_id) DO NOTHING"""))
    op.execute(sa.text("""INSERT INTO support_messages
      (id,conversation_id,sender_type,sender_user_id,body,category,client_message_id,created_at)
      SELECT f.id,c.id,'user',f.user_id,f.content,
        CASE lower(trim(coalesce(f.category,'')))
          WHEN 'general' THEN 'general'::support_category
          WHEN 'general feedback' THEN 'general'::support_category
          WHEN 'bug report' THEN 'bug_report'::support_category
          WHEN 'bug' THEN 'bug_report'::support_category
          WHEN 'feature request' THEN 'feature_request'::support_category
          WHEN 'account' THEN 'account'::support_category
          WHEN 'billing' THEN 'billing'::support_category
          WHEN 'other' THEN 'other'::support_category
          ELSE NULL END,
        f.id,f.created_at
      FROM feedbacks f JOIN support_conversations c ON c.user_id=f.user_id
      ON CONFLICT (conversation_id,client_message_id) DO UPDATE SET category=excluded.category
      WHERE support_messages.category IS NULL"""))
    # Existing migrated messages use the legacy feedback UUID as their client key.
    op.execute(sa.text("""UPDATE support_messages m SET category =
      CASE lower(trim(coalesce(f.category,'')))
        WHEN 'general' THEN 'general'::support_category WHEN 'general feedback' THEN 'general'::support_category
        WHEN 'bug report' THEN 'bug_report'::support_category WHEN 'bug' THEN 'bug_report'::support_category
        WHEN 'feature request' THEN 'feature_request'::support_category WHEN 'account' THEN 'account'::support_category
        WHEN 'billing' THEN 'billing'::support_category WHEN 'other' THEN 'other'::support_category ELSE NULL END
      FROM feedbacks f WHERE m.client_message_id=f.id AND m.category IS NULL"""))
    op.execute(sa.text("""UPDATE support_conversations c SET
      created_at=least(c.created_at,a.first_message_at),
      last_message_at=greatest(c.last_message_at,a.last_message_at),
      last_user_message_at=greatest(c.last_user_message_at,a.last_user_message_at),
      admin_unread_count=a.admin_unread_count
      FROM (SELECT conversation_id,min(created_at) AS first_message_at,max(created_at) AS last_message_at,
        max(created_at) FILTER (WHERE sender_type='user') AS last_user_message_at,
        count(*) FILTER (WHERE sender_type='user' AND admin_read_at IS NULL)::int AS admin_unread_count
        FROM support_messages GROUP BY conversation_id) a WHERE a.conversation_id=c.id"""))


def downgrade():
    op.drop_index("ix_support_messages_conversation_category_created", table_name="support_messages")
    op.drop_column("support_messages", "category")
    op.execute("DROP TYPE IF EXISTS support_category")
