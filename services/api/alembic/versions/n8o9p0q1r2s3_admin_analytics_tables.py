"""Admin analytics: user geo, licenses, assignments

Revision ID: n8o9p0q1r2s3
Revises: m7n8o9p0q1r2
Create Date: 2026-06-02

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "n8o9p0q1r2s3"
down_revision: Union[str, Sequence[str], None] = "m7n8o9p0q1r2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("ALTER TABLE users ADD COLUMN IF NOT EXISTS country VARCHAR(128)"))
    op.execute(sa.text("ALTER TABLE users ADD COLUMN IF NOT EXISTS continent VARCHAR(64)"))
    op.execute(
        sa.text("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ"),
    )

    op.execute(
        sa.text("""
        DO $$ BEGIN
            CREATE TYPE assignment_status AS ENUM ('pending', 'processed', 'completed');
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END $$;
        """),
    )

    assignment_status = postgresql.ENUM(
        "pending",
        "processed",
        "completed",
        name="assignment_status",
        create_type=False,
    )

    op.create_table(
        "licenses",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("plan_name", sa.String(length=128), nullable=False),
        sa.Column("price", sa.Numeric(10, 2), nullable=False),
        sa.Column(
            "billing_period_months",
            sa.Integer(),
            server_default=sa.text("1"),
            nullable=False,
        ),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_licenses_user_id", "licenses", ["user_id"], unique=False)
    op.create_index("ix_licenses_status", "licenses", ["status"], unique=False)

    op.create_table(
        "assignments",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("book_id", sa.UUID(), nullable=True),
        sa.Column("subject", sa.String(length=512), nullable=False),
        sa.Column(
            "status",
            assignment_status,
            nullable=False,
        ),
        sa.Column("flashcard_set_id", sa.UUID(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["book_id"], ["books.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["flashcard_set_id"], ["flashcard_sets.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_assignments_user_id", "assignments", ["user_id"], unique=False)
    op.create_index("ix_assignments_book_id", "assignments", ["book_id"], unique=False)
    op.create_index("ix_assignments_status", "assignments", ["status"], unique=False)

    # Backfill licenses from existing subscription tiers
    op.execute(
        sa.text("""
        INSERT INTO licenses (id, user_id, plan_name, price, billing_period_months, status, created_at, updated_at)
        SELECT
            gen_random_uuid(),
            u.id,
            CASE
                WHEN u.subscription_tier = 'premium' THEN 'Premium'
                ELSE 'Student'
            END,
            CASE
                WHEN u.subscription_tier = 'premium' THEN 15.00
                ELSE 8.00
            END,
            1,
            'active',
            u.created_at,
            NOW()
        FROM users u
        WHERE u.subscription_tier IN ('student', 'premium')
        """),
    )

    # Backfill assignments from uploaded books
    op.execute(
        sa.text("""
        INSERT INTO assignments (id, user_id, book_id, subject, status, flashcard_set_id, created_at, completed_at)
        SELECT
            gen_random_uuid(),
            b.user_id,
            b.id,
            b.title,
            CASE
                WHEN b.status = 'processing' THEN 'pending'::assignment_status
                WHEN EXISTS (
                    SELECT 1 FROM quiz_results qr
                    JOIN flashcard_sets fs ON fs.id = qr.set_id
                    WHERE fs.book_id = b.id
                ) THEN 'completed'::assignment_status
                WHEN EXISTS (
                    SELECT 1 FROM flashcard_sets fs WHERE fs.book_id = b.id
                ) THEN 'processed'::assignment_status
                ELSE 'pending'::assignment_status
            END,
            (
                SELECT fs.id FROM flashcard_sets fs
                WHERE fs.book_id = b.id
                ORDER BY fs.created_at ASC
                LIMIT 1
            ),
            b.created_at,
            (
                SELECT MAX(qr.completed_at) FROM quiz_results qr
                JOIN flashcard_sets fs ON fs.id = qr.set_id
                WHERE fs.book_id = b.id
            )
        FROM books b
        """),
    )

    # Seed last_active_at from study events and quiz results
    op.execute(
        sa.text("""
        UPDATE users u SET last_active_at = sub.last_at
        FROM (
            SELECT user_id, MAX(ts) AS last_at
            FROM (
                SELECT user_id, created_at AS ts FROM study_events
                UNION ALL
                SELECT user_id, completed_at AS ts FROM quiz_results
            ) activity
            GROUP BY user_id
        ) sub
        WHERE u.id = sub.user_id
        """),
    )


def downgrade() -> None:
    op.drop_index("ix_assignments_status", table_name="assignments")
    op.drop_index("ix_assignments_book_id", table_name="assignments")
    op.drop_index("ix_assignments_user_id", table_name="assignments")
    op.drop_table("assignments")
    op.drop_index("ix_licenses_status", table_name="licenses")
    op.drop_index("ix_licenses_user_id", table_name="licenses")
    op.drop_table("licenses")
    op.drop_column("users", "last_active_at")
    op.drop_column("users", "continent")
    op.drop_column("users", "country")
    op.execute(sa.text('DROP TYPE IF EXISTS assignment_status'))
