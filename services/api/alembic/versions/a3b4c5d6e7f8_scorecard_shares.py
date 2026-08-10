"""Add secure scorecard share tokens.

Revision ID: a3b4c5d6e7f8
Revises: h8i9j0k1l2m3
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "a3b4c5d6e7f8"
down_revision: Union[str, Sequence[str], None] = "h8i9j0k1l2m3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "scorecard_shares",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("scorecard_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("scorecards.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("token_prefix", sa.String(8), nullable=False),
        sa.Column("show_display_name", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("public_display_name", sa.String(80)),
        sa.Column("public_message", sa.String(240)),
        sa.Column("image_version", sa.Integer(), nullable=False, server_default=sa.text("1")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
        sa.Column("last_accessed_at", sa.DateTime(timezone=True)),
        sa.Column("access_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
    )
    op.create_index("ix_scorecard_shares_token_hash", "scorecard_shares", ["token_hash"], unique=True)
    op.create_index("ix_scorecard_shares_owner_scorecard", "scorecard_shares", ["user_id", "scorecard_id"])
    op.create_index("ix_scorecard_shares_expiry_revocation", "scorecard_shares", ["expires_at", "revoked_at"])
    op.drop_column("scorecards", "public_share_token")
    op.drop_column("scorecards", "revoked_at")
    op.drop_column("scorecards", "expires_at")
    op.drop_column("scorecards", "visibility")


def downgrade() -> None:
    op.add_column("scorecards", sa.Column("visibility", sa.String(24), nullable=False, server_default=sa.text("'private'")))
    op.add_column("scorecards", sa.Column("expires_at", sa.DateTime(timezone=True)))
    op.add_column("scorecards", sa.Column("revoked_at", sa.DateTime(timezone=True)))
    op.add_column("scorecards", sa.Column("public_share_token", sa.String(64)))
    op.create_unique_constraint("uq_scorecards_public_share_token", "scorecards", ["public_share_token"])
    op.drop_index("ix_scorecard_shares_expiry_revocation", table_name="scorecard_shares")
    op.drop_index("ix_scorecard_shares_owner_scorecard", table_name="scorecard_shares")
    op.drop_index("ix_scorecard_shares_token_hash", table_name="scorecard_shares")
    op.drop_table("scorecard_shares")
