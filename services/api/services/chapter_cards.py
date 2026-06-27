"""Per-chapter flashcard counts for a book."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from models.flashcard import Flashcard, FlashcardSet


async def chapter_card_counts_for_book(
    db: AsyncSession,
    *,
    book_id: UUID,
    user_id: UUID,
) -> dict[str, int]:
    """Return chapter title -> number of flashcards generated for that chapter."""
    stmt = (
        select(Flashcard.chapter, func.count(Flashcard.id))
        .join(FlashcardSet, Flashcard.set_id == FlashcardSet.id)
        .where(
            FlashcardSet.book_id == book_id,
            FlashcardSet.user_id == user_id,
            Flashcard.chapter.isnot(None),
            Flashcard.chapter != "",
        )
        .group_by(Flashcard.chapter)
    )
    rows = await db.execute(stmt)
    return {str(chapter): int(count) for chapter, count in rows.all() if chapter}
