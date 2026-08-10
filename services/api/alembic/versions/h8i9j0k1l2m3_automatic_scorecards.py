"""Add scorecard entity scope for monthly and course scorecards.

Revision ID: h8i9j0k1l2m3
Revises: g7h8i9j0k1l2
"""

from alembic import op
import sqlalchemy as sa

revision = "h8i9j0k1l2m3"
down_revision = "g7h8i9j0k1l2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("scorecards", sa.Column("entity_id", sa.String(128), nullable=False, server_default=""))
    op.drop_constraint("uq_scorecards_period", "scorecards", type_="unique")
    op.create_unique_constraint("uq_scorecards_period", "scorecards", ["user_id", "period_type", "entity_id", "period_start", "period_end"])


def downgrade() -> None:
    op.drop_constraint("uq_scorecards_period", "scorecards", type_="unique")
    op.create_unique_constraint("uq_scorecards_period", "scorecards", ["user_id", "period_type", "period_start", "period_end"])
    op.drop_column("scorecards", "entity_id")
