"""Study groups tables.

Revision ID: t5u6v7w8x9y0
Revises: s4t5u6v7w8x9
Create Date: 2026-06-12
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "t5u6v7w8x9y0"
down_revision: Union[str, None] = "s4t5u6v7w8x9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "study_groups",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("code", sa.String(length=12), nullable=False),
        sa.Column("privacy", sa.String(length=16), server_default="public", nullable=False),
        sa.Column("created_by", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code"),
    )
    op.create_index("ix_study_groups_code", "study_groups", ["code"], unique=True)
    op.create_index("ix_study_groups_created_by", "study_groups", ["created_by"], unique=False)

    op.create_table(
        "study_group_members",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("group_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("role", sa.String(length=16), server_default="member", nullable=False),
        sa.Column("joined_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["group_id"], ["study_groups.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("group_id", "user_id", name="uq_study_group_member"),
    )
    op.create_index("ix_study_group_members_group_id", "study_group_members", ["group_id"], unique=False)
    op.create_index("ix_study_group_members_user_id", "study_group_members", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_study_group_members_user_id", table_name="study_group_members")
    op.drop_index("ix_study_group_members_group_id", table_name="study_group_members")
    op.drop_table("study_group_members")
    op.drop_index("ix_study_groups_created_by", table_name="study_groups")
    op.drop_index("ix_study_groups_code", table_name="study_groups")
    op.drop_table("study_groups")
