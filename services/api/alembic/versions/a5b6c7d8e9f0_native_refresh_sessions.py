"""Add native refresh sessions table for mobile security architecture (PAR-050).

Revision ID: a5b6c7d8e9f0
Revises: f1f11e9c4f4e
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "a5b6c7d8e9f0"
down_revision: Union[str, Sequence[str], None] = "f1f11e9c4f4e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "native_refresh_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("family_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("client_platform", sa.String(32)),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "last_used_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
        sa.Column(
            "replaced_by_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("native_refresh_sessions.id", ondelete="SET NULL"),
        ),
    )
    op.create_index(
        "ix_native_refresh_sessions_user_id",
        "native_refresh_sessions",
        ["user_id"],
    )
    op.create_index(
        "ix_native_refresh_sessions_token_hash",
        "native_refresh_sessions",
        ["token_hash"],
        unique=True,
    )
    op.create_index(
        "ix_native_refresh_sessions_family_id",
        "native_refresh_sessions",
        ["family_id"],
    )
    op.create_index(
        "ix_native_refresh_sessions_expires_at",
        "native_refresh_sessions",
        ["expires_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_native_refresh_sessions_expires_at",
        table_name="native_refresh_sessions",
    )
    op.drop_index(
        "ix_native_refresh_sessions_family_id",
        table_name="native_refresh_sessions",
    )
    op.drop_index(
        "ix_native_refresh_sessions_token_hash",
        table_name="native_refresh_sessions",
    )
    op.drop_index(
        "ix_native_refresh_sessions_user_id",
        table_name="native_refresh_sessions",
    )
    op.drop_table("native_refresh_sessions")
