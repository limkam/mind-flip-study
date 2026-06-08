"""User onboarding fields and IP capture columns

Revision ID: o9p0q1r2s3t4
Revises: n8o9p0q1r2s3
Create Date: 2026-06-02

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "o9p0q1r2s3t4"
down_revision: Union[str, Sequence[str], None] = "n8o9p0q1r2s3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("age", sa.Integer(), nullable=True))
    op.add_column("users", sa.Column("occupation", sa.String(length=100), nullable=True))
    op.add_column(
        "users",
        sa.Column(
            "onboarding_completed",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column("users", sa.Column("last_ip", sa.String(length=45), nullable=True))
    op.add_column(
        "users",
        sa.Column(
            "ip_history",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )
    # Existing users should not be forced through onboarding
    op.execute(sa.text("UPDATE users SET onboarding_completed = true"))


def downgrade() -> None:
    op.drop_column("users", "ip_history")
    op.drop_column("users", "last_ip")
    op.drop_column("users", "onboarding_completed")
    op.drop_column("users", "occupation")
    op.drop_column("users", "age")
