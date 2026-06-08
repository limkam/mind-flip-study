"""users: nullable password for OAuth + Apple subject

Revision ID: i3j4k5l6m7n8
Revises: g2h3i4j5k6l7
Create Date: 2026-05-12

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "i3j4k5l6m7n8"
down_revision: Union[str, Sequence[str], None] = "g2h3i4j5k6l7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column("users", "hashed_password", existing_type=sa.String(length=255), nullable=True)
    op.add_column("users", sa.Column("oauth_apple_sub", sa.String(length=255), nullable=True))
    op.create_unique_constraint("uq_users_oauth_apple_sub", "users", ["oauth_apple_sub"])


def downgrade() -> None:
    # OAuth-only accounts cannot be represented with NOT NULL password; remove them on downgrade.
    op.execute(sa.text("DELETE FROM users WHERE hashed_password IS NULL"))
    op.drop_constraint("uq_users_oauth_apple_sub", "users", type_="unique")
    op.drop_column("users", "oauth_apple_sub")
    op.alter_column("users", "hashed_password", existing_type=sa.String(length=255), nullable=False)
