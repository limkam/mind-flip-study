"""Add UTM/referral acquisition-source capture and admin sub-role to users.

Revision ID: l5m6n7o8p9q0
Revises: k4l5m6n7o8p9
Create Date: 2026-08-19
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "l5m6n7o8p9q0"
down_revision: Union[str, None] = "k4l5m6n7o8p9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("utm_source", sa.String(length=128), nullable=True))
    op.add_column("users", sa.Column("utm_medium", sa.String(length=128), nullable=True))
    op.add_column("users", sa.Column("utm_campaign", sa.String(length=128), nullable=True))
    op.add_column("users", sa.Column("referral_code", sa.String(length=64), nullable=True))
    op.add_column("users", sa.Column("admin_role", sa.String(length=32), nullable=True))
    # Every existing admin keeps full access — only new admins default to no admin_role.
    op.execute("UPDATE users SET admin_role = 'owner' WHERE role = 'admin'")


def downgrade() -> None:
    op.drop_column("users", "admin_role")
    op.drop_column("users", "referral_code")
    op.drop_column("users", "utm_campaign")
    op.drop_column("users", "utm_medium")
    op.drop_column("users", "utm_source")
