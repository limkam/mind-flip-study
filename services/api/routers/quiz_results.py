from __future__ import annotations

import logging
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import get_current_user
from models.book import Book
from models.flashcard import FlashcardSet
from models.quiz import QuizResult
from models.user import User
from schemas.pagination import total_pages
from schemas.quiz_api import QuizResultCreate, QuizResultOut, QuizResultPage

router = APIRouter(tags=["quiz-results"])
log = logging.getLogger(__name__)


async def _enrich_extras_for_results(
    db: AsyncSession,
    rows: list[QuizResult],
) -> list[QuizResultOut]:
    if not rows:
        return []
    set_ids = {row.set_id for row in rows}
    fs_r = await db.execute(select(FlashcardSet).where(FlashcardSet.id.in_(set_ids)))
    fsets = {s.id: s for s in fs_r.scalars().all()}
    book_ids = {s.book_id for s in fsets.values() if s.book_id}
    books: dict[Any, Book] = {}
    if book_ids:
        br = await db.execute(select(Book).where(Book.id.in_(book_ids)))
        books = {b.id: b for b in br.scalars().all()}
    out: list[QuizResultOut] = []
    for row in rows:
        ex = dict(row.extras or {})
        fs = fsets.get(row.set_id)
        if fs is not None:
            ex.setdefault("set_title", fs.title)
            if fs.book_id and fs.book_id in books:
                ex.setdefault("book_title", books[fs.book_id].title)
        out.append(QuizResultOut.from_orm_row(row, ex))
    return out


@router.get("/", response_model=QuizResultPage)
async def list_quiz_results(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    page: int = Query(1, ge=1),
    size: int = Query(100, ge=1, le=200),
) -> QuizResultPage:
    total = int(
        await db.scalar(
            select(func.count()).select_from(QuizResult).where(QuizResult.user_id == current_user.id),
        )
        or 0,
    )
    skip = (page - 1) * size
    r = await db.execute(
        select(QuizResult)
        .where(QuizResult.user_id == current_user.id)
        .order_by(QuizResult.completed_at.desc())
        .offset(skip)
        .limit(size),
    )
    rows = list(r.scalars().all())
    items = await _enrich_extras_for_results(db, rows)
    has_more = page * size < total
    return QuizResultPage(
        items=items,
        total=total,
        page=page,
        size=size,
        has_more=has_more,
        total_pages=total_pages(total=total, size=size),
    )


@router.post("/", response_model=QuizResultOut, status_code=status.HTTP_201_CREATED)
async def create_quiz_result(
    body: QuizResultCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> QuizResultOut:
    sr = await db.execute(
        select(FlashcardSet).where(FlashcardSet.id == body.set_id, FlashcardSet.user_id == current_user.id),
    )
    if sr.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Flashcard set not found")
    extras: dict[str, Any] = dict(body.extras or {})
    if extras.get("percentage") is None and body.total_questions:
        extras["percentage"] = round(100.0 * body.score / body.total_questions, 1)
    row = QuizResult(
        user_id=current_user.id,
        set_id=body.set_id,
        score=body.score,
        total_questions=body.total_questions,
        time_taken_seconds=body.time_taken_seconds,
        extras=extras,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    enriched = await _enrich_extras_for_results(db, [row])
    try:
        # Send by name so the API process never imports task modules at startup (avoids
        # accidental cycles with celery_app ↔ task packages).
        from tasks.celery_app import celery as celery_app

        celery_app.send_task("tasks.leaderboard_tasks.refresh_leaderboard_task")
    except Exception as exc:
        log.warning("leaderboard refresh enqueue failed: %s", exc)
    return enriched[0]
