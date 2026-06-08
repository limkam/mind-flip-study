"""folders: description, color, icon, book_ids, flashcard_set_ids

Revision ID: c7d8e9f0a1b2
Revises: b3e9a1c2d4f5
Create Date: 2026-05-09

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "c7d8e9f0a1b2"
down_revision: Union[str, Sequence[str], None] = "b3e9a1c2d4f5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("folders", sa.Column("description", sa.Text(), nullable=True))
    op.add_column("folders", sa.Column("color", sa.String(length=64), nullable=True))
    op.add_column("folders", sa.Column("icon", sa.String(length=16), nullable=True))
    op.add_column(
        "folders",
        sa.Column(
            "book_ids",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
    )
    op.add_column(
        "folders",
        sa.Column(
            "flashcard_set_ids",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("folders", "flashcard_set_ids")
    op.drop_column("folders", "book_ids")
    op.drop_column("folders", "icon")
    op.drop_column("folders", "color")
    op.drop_column("folders", "description")
