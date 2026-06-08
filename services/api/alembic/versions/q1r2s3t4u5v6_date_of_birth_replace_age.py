"""Replace users.age with date_of_birth

Revision ID: q1r2s3t4u5v6
Revises: p0q1r2s3t4u5
Create Date: 2026-06-08

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "q1r2s3t4u5v6"
down_revision: Union[str, Sequence[str], None] = "p0q1r2s3t4u5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("date_of_birth", sa.Date(), nullable=True))
    op.execute(
        sa.text(
            """
            UPDATE users
            SET date_of_birth = (CURRENT_DATE - (age || ' years')::interval)::date
            WHERE age IS NOT NULL
            """,
        ),
    )
    op.drop_column("users", "age")


def downgrade() -> None:
    op.add_column("users", sa.Column("age", sa.Integer(), nullable=True))
    op.execute(
        sa.text(
            """
            UPDATE users
            SET age = EXTRACT(YEAR FROM age(CURRENT_DATE, date_of_birth))::integer
            WHERE date_of_birth IS NOT NULL
            """,
        ),
    )
    op.drop_column("users", "date_of_birth")
