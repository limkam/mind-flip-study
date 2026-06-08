"""add extras/tags/result_data JSON columns

Revision ID: b3e9a1c2d4f5
Revises: 0f1a416a080a
Create Date: 2026-05-09

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "b3e9a1c2d4f5"
down_revision: Union[str, Sequence[str], None] = "0f1a416a080a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "preferences",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
    )
    op.add_column(
        "books",
        sa.Column(
            "extras",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
    )
    op.add_column(
        "flashcard_sets",
        sa.Column(
            "tags",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
    )
    op.add_column(
        "quiz_challenges",
        sa.Column(
            "result_data",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
    )
    op.add_column(
        "quiz_results",
        sa.Column(
            "extras",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("quiz_results", "extras")
    op.drop_column("quiz_challenges", "result_data")
    op.drop_column("flashcard_sets", "tags")
    op.drop_column("books", "extras")
    op.drop_column("users", "preferences")
