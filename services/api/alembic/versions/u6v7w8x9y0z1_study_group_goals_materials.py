"""Study group goals and shared materials.

Revision ID: u6v7w8x9y0z1
Revises: t5u6v7w8x9y0
Create Date: 2026-06-12
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "u6v7w8x9y0z1"
down_revision: Union[str, None] = "t5u6v7w8x9y0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "study_groups",
        sa.Column("weekly_card_goal", sa.Integer(), server_default="20", nullable=False),
    )
    op.create_table(
        "study_group_materials",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("group_id", sa.UUID(), nullable=False),
        sa.Column("book_id", sa.UUID(), nullable=False),
        sa.Column("added_by", sa.UUID(), nullable=False),
        sa.Column("added_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["added_by"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["book_id"], ["books.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["group_id"], ["study_groups.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("group_id", "book_id", name="uq_study_group_material"),
    )
    op.create_index("ix_study_group_materials_group_id", "study_group_materials", ["group_id"], unique=False)
    op.create_index("ix_study_group_materials_book_id", "study_group_materials", ["book_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_study_group_materials_book_id", table_name="study_group_materials")
    op.drop_index("ix_study_group_materials_group_id", table_name="study_group_materials")
    op.drop_table("study_group_materials")
    op.drop_column("study_groups", "weekly_card_goal")
