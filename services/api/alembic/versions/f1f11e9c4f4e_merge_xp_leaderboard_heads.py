"""merge_xp_leaderboard_heads

Revision ID: f1f11e9c4f4e
Revises: f8g9h0i1j2k3, z4a5b6c7d8e9
Create Date: 2026-08-07 11:51:07.264031

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f1f11e9c4f4e'
down_revision: Union[str, Sequence[str], None] = ('f8g9h0i1j2k3', 'z4a5b6c7d8e9')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
