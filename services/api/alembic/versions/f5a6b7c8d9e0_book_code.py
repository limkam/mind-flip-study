"""Add unique per-book tracking code, backfilled for existing rows.

Revision ID: f5a6b7c8d9e0
Revises: e4f5a6b7c8d9
Create Date: 2026-08-13
"""

from __future__ import annotations

import secrets
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


_BOOK_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
_BOOK_CODE_LENGTH = 8


revision: str = "f5a6b7c8d9e0"
down_revision: Union[str, Sequence[str], None] = "e4f5a6b7c8d9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _new_book_code() -> str:
    return "MF-" + "".join(
        secrets.choice(_BOOK_CODE_ALPHABET) for _ in range(_BOOK_CODE_LENGTH)
    )


def upgrade() -> None:
    bind = op.get_bind()
    op.add_column("books", sa.Column("book_code", sa.String(length=16), nullable=True))

    book_ids = [row[0] for row in bind.execute(sa.text("SELECT id FROM books")).fetchall()]
    used: set[str] = set()
    for book_id in book_ids:
        code = _new_book_code()
        while code in used:
            code = _new_book_code()
        used.add(code)
        bind.execute(
            sa.text("UPDATE books SET book_code = :code WHERE id = :id"),
            {"code": code, "id": book_id},
        )

    op.alter_column("books", "book_code", nullable=False)
    op.create_index("ix_books_book_code", "books", ["book_code"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_books_book_code", table_name="books")
    op.drop_column("books", "book_code")
