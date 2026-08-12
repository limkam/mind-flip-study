"""Cascade deletion of a book and all associated study content."""

from __future__ import annotations

import logging
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from ai_generation import parse_set_description
from models.book import Book
from models.flashcard import Flashcard, FlashcardSet, Folder, Workbook
from models.quiz import QuizChallenge, QuizResult, StudyEvent
from s3_cleanup import delete_book_s3_assets

log = logging.getLogger(__name__)


async def _flashcard_set_ids_for_book(db: AsyncSession, book: Book) -> list[UUID]:
    """All flashcard set IDs tied to this book, including orphaned rows from legacy deletes."""
    ids: set[UUID] = set()

    linked = await db.scalars(select(FlashcardSet.id).where(FlashcardSet.book_id == book.id))
    ids.update(linked.all())

    extras = dict(book.extras or {})
    ai_job = extras.get("ai_job") if isinstance(extras.get("ai_job"), dict) else {}
    resource_id = ai_job.get("resource_id")
    if resource_id:
        try:
            ids.add(UUID(str(resource_id)))
        except (TypeError, ValueError):
            pass

    task_id = ai_job.get("task_id")
    if task_id:
        marker = f'"job_id": "{task_id}"'
        orphaned = await db.scalars(
            select(FlashcardSet.id).where(
                FlashcardSet.user_id == book.user_id,
                FlashcardSet.book_id.is_(None),
                FlashcardSet.description.contains(marker),
            ),
        )
        ids.update(orphaned.all())

    # Sets whose JSON description references this book id (defensive).
    book_id_marker = str(book.id)
    legacy = await db.scalars(
        select(FlashcardSet).where(
            FlashcardSet.user_id == book.user_id,
            FlashcardSet.book_id.is_(None),
        ),
    )
    for row in legacy.all():
        meta = parse_set_description(row.description)
        content_map = meta.get("content_map") or []
        if any(
            isinstance(item, dict) and str(item.get("book_id", "")) == book_id_marker
            for item in content_map
        ):
            ids.add(row.id)

    # Orphaned sets from legacy deletes (book_id cleared via ON DELETE SET NULL).
    title_matches = await db.scalars(
        select(FlashcardSet.id).where(
            FlashcardSet.user_id == book.user_id,
            FlashcardSet.book_id.is_(None),
            FlashcardSet.title == book.title,
        ),
    )
    ids.update(title_matches.all())

    return list(ids)


async def _purge_folders_for_book(
    db: AsyncSession,
    *,
    user_id: UUID,
    book_id: UUID,
    set_ids: list[UUID],
) -> None:
    set_id_strs = {str(sid) for sid in set_ids}
    book_id_str = str(book_id)
    folders = (await db.scalars(select(Folder).where(Folder.user_id == user_id))).all()
    for folder in folders:
        book_ids = [bid for bid in (folder.book_ids or []) if str(bid) != book_id_str]
        set_refs = [sid for sid in (folder.flashcard_set_ids or []) if str(sid) not in set_id_strs]
        if book_ids != list(folder.book_ids or []) or set_refs != list(folder.flashcard_set_ids or []):
            folder.book_ids = book_ids
            folder.flashcard_set_ids = set_refs


async def _delete_flashcard_sets(db: AsyncSession, set_ids: list[UUID]) -> int:
    if not set_ids:
        return 0

    card_ids = (
        await db.scalars(select(Flashcard.id).where(Flashcard.set_id.in_(set_ids)))
    ).all()
    if card_ids:
        await db.execute(delete(StudyEvent).where(StudyEvent.card_id.in_(card_ids)))

    await db.execute(delete(StudyEvent).where(StudyEvent.set_id.in_(set_ids)))
    await db.execute(delete(QuizResult).where(QuizResult.set_id.in_(set_ids)))
    await db.execute(delete(QuizChallenge).where(QuizChallenge.set_id.in_(set_ids)))
    await db.execute(delete(Flashcard).where(Flashcard.set_id.in_(set_ids)))
    result = await db.execute(delete(FlashcardSet).where(FlashcardSet.id.in_(set_ids)))
    return int(result.rowcount or 0)


async def cascade_delete_book(
    db: AsyncSession,
    book: Book,
    *,
    commit: bool = True,
    delete_assets: bool = True,
) -> int:
    """
    Delete a book and all flashcard sets/cards tied to it.
    Returns number of flashcard sets removed.
    """
    set_ids = await _flashcard_set_ids_for_book(db, book)
    log.info(
        "book_delete_cascade",
        extra={"book_id": str(book.id), "set_count": len(set_ids), "set_ids": [str(s) for s in set_ids]},
    )

    await _purge_folders_for_book(
        db,
        user_id=book.user_id,
        book_id=book.id,
        set_ids=set_ids,
    )
    removed_sets = await _delete_flashcard_sets(db, set_ids)

    if delete_assets:
        delete_book_s3_assets(s3_key=book.s3_key, extras=book.extras)
    await db.execute(delete(Workbook).where(Workbook.book_id == book.id))
    await db.execute(delete(Book).where(Book.id == book.id))
    if commit:
        await db.commit()
    return removed_sets
