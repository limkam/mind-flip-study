"""card_progress: unique (user_id, card_id)

Revision ID: f1e2d3c4b5a6
Revises: e2f3a4b5c6d7
Create Date: 2026-05-12

"""

from typing import Sequence, Union

from alembic import op

revision: str = "f1e2d3c4b5a6"
down_revision: Union[str, Sequence[str], None] = "e2f3a4b5c6d7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_unique_constraint(
        "uq_card_progress_user_card",
        "card_progress",
        ["user_id", "card_id"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_card_progress_user_card", "card_progress", type_="unique")
