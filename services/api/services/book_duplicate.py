"""Detect duplicate book uploads by title."""

from __future__ import annotations

import re
import unicodedata
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.book import Book


def normalize_book_title(title: str) -> str:
    """Lowercase, strip punctuation/extra whitespace for fuzzy title match."""
    text = unicodedata.normalize("NFKD", title.strip().lower())
    text = re.sub(r"[^\w\s]", "", text)
    return re.sub(r"\s+", " ", text).strip()


async def find_duplicate_books(
    db: AsyncSession,
    *,
    user_id: UUID,
    title: str,
) -> list[Book]:
    """Return library books matching exact or normalized title."""
    normalized = normalize_book_title(title)
    if not normalized:
        return []
    result = await db.execute(select(Book).where(Book.user_id == user_id))
    matches: list[Book] = []
    for book in result.scalars().all():
        if book.title.strip().lower() == title.strip().lower():
            matches.append(book)
            continue
        if normalize_book_title(book.title) == normalized:
            matches.append(book)
    return matches
