"""Add chapter, difficulty, cognitive_level to flashcards."""

from alembic import op
import sqlalchemy as sa

revision = "r2s3t4u5v6w7"
down_revision = "q1r2s3t4u5v6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("flashcards", sa.Column("chapter", sa.String(length=512), nullable=True))
    op.add_column("flashcards", sa.Column("difficulty", sa.String(length=32), nullable=True))
    op.add_column("flashcards", sa.Column("cognitive_level", sa.String(length=32), nullable=True))


def downgrade() -> None:
    op.drop_column("flashcards", "cognitive_level")
    op.drop_column("flashcards", "difficulty")
    op.drop_column("flashcards", "chapter")
