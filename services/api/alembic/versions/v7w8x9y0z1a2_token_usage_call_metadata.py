"""Add call_metadata JSONB to token_usage for generation metrics."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "v7w8x9y0z1a2"
down_revision: Union[str, None] = "u6v7w8x9y0z1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("token_usage", sa.Column("call_metadata", JSONB, nullable=True))


def downgrade() -> None:
    op.drop_column("token_usage", "call_metadata")
