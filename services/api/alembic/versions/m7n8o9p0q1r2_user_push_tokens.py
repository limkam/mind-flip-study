"""Add push_token and push_platform to users

Revision ID: m7n8o9p0q1r2
Revises: l6m7n8o9p0q1
Create Date: 2026-05-15

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "m7n8o9p0q1r2"
down_revision: Union[str, Sequence[str], None] = "l6m7n8o9p0q1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("push_token", sa.String(512), nullable=True))
    op.add_column("users", sa.Column("push_platform", sa.String(16), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "push_platform")
    op.drop_column("users", "push_token")
