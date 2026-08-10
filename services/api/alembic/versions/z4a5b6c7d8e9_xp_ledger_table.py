"""create xp_transactions table

Revision ID: z4a5b6c7d8e9
Revises: z3a4b5c6d7e8
Create Date: 2026-08-07 11:40:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'z4a5b6c7d8e9'
down_revision = 'z3a4b5c6d7e8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'xp_transactions',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('amount', sa.Integer(), nullable=False),
        sa.Column('action_type', sa.String(length=64), nullable=False),
        sa.Column('source_type', sa.String(length=64), nullable=False),
        sa.Column('source_id', sa.String(length=255), nullable=False),
        sa.Column('metadata', postgresql.JSONB(), server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'source_type', 'source_id', 'action_type', name='uq_xp_transactions_source_action')
    )
    op.create_index('ix_xp_transactions_user_id', 'xp_transactions', ['user_id'], unique=False)
    op.create_index('ix_xp_transactions_created_at', 'xp_transactions', ['created_at'], unique=False)
    op.create_index('ix_xp_transactions_user_created', 'xp_transactions', ['user_id', 'created_at'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_xp_transactions_user_created', table_name='xp_transactions')
    op.drop_index('ix_xp_transactions_created_at', table_name='xp_transactions')
    op.drop_index('ix_xp_transactions_user_id', table_name='xp_transactions')
    op.drop_table('xp_transactions')
