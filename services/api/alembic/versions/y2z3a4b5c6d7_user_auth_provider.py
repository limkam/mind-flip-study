"""Add authentication provider to users.

Revision ID: y2z3a4b5c6d7
Revises: x1y2z3a4b5c6
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "y2z3a4b5c6d7"
down_revision: Union[str, Sequence[str], None] = "x1y2z3a4b5c6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "auth_provider",
            sa.String(length=32),
            nullable=False,
            server_default=sa.text("'email'"),
        ),
    )
    op.execute(sa.text("UPDATE users SET auth_provider = 'apple' WHERE oauth_apple_sub IS NOT NULL"))


def downgrade() -> None:
    op.drop_column("users", "auth_provider")
