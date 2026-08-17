"""Replace bounded shared-study sessions with quota-consuming content activations.

Revision ID: j2k3l4m5n6o7
Revises: i9j0k1l2m3n4
Create Date: 2026-08-16
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "j2k3l4m5n6o7"
down_revision: Union[str, None] = "i9j0k1l2m3n4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_index("ix_study_group_shared_sessions_user_material", table_name="study_group_shared_sessions")
    op.drop_table("study_group_shared_sessions")

    op.create_table(
        "study_group_content_activations",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("material_id", sa.UUID(), nullable=False),
        sa.Column("book_id", sa.UUID(), nullable=False),
        sa.Column("set_id", sa.UUID(), nullable=False),
        sa.Column("activated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("deactivated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["material_id"], ["study_group_materials.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["book_id"], ["books.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["set_id"], ["flashcard_sets.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "material_id", name="uq_content_activation_user_material"),
    )
    op.create_index(
        "ix_content_activation_user_deactivated",
        "study_group_content_activations",
        ["user_id", "deactivated_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_content_activation_user_deactivated", table_name="study_group_content_activations")
    op.drop_table("study_group_content_activations")

    op.create_table(
        "study_group_shared_sessions",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("material_id", sa.UUID(), nullable=False),
        sa.Column("accessed_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["material_id"], ["study_group_materials.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_study_group_shared_sessions_user_material",
        "study_group_shared_sessions",
        ["user_id", "material_id", "accessed_at"],
        unique=False,
    )
