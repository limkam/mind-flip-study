from __future__ import annotations

import logging
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from config import settings
from dependencies import get_current_user
from models.book import Book
from models.flashcard import FlashcardSet
from models.quiz import QuizResult
from models.user import User
from schemas.pagination import total_pages
from schemas.quiz_api import QuizResultCreate, QuizResultOut, QuizResultPage
from services.engagement import EventInput, emit_trusted_event
from services.celebration_events import events_for_trusted_row
from services.scorecards import refresh_current_scorecards
from datetime import UTC, datetime

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


from services.xp_service import process_quiz_completion_xp

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
    submitted_answers = extras.get("answers") or extras.get("user_answers")
    attempt_id = str(extras.get("attempt_id") or "") if extras.get("attempt_id") else None

    # Create initial QuizResult row first to get authoritative ID
    row = QuizResult(
        user_id=current_user.id,
        set_id=body.set_id,
        score=body.score,
        total_questions=body.total_questions,
        time_taken_seconds=body.time_taken_seconds,
        extras=extras,
    )
    db.add(row)
    await db.flush()

    # Server-side answer verification & XP ledger award
    val_score, val_total, xp_awarded = await process_quiz_completion_xp(
        db,
        user_id=current_user.id,
        quiz_result_id=row.id,
        set_id=body.set_id,
        client_score=body.score,
        client_total=body.total_questions,
        submitted_answers=submitted_answers,
        attempt_id=attempt_id,
        created_at=row.completed_at,
    )

    # Update QuizResult with validated numbers & XP metadata
    row.score = val_score
    row.total_questions = val_total
    extras["validated_score"] = val_score
    extras["validated_total"] = val_total
    extras["xp_awarded"] = xp_awarded
    extras["percentage"] = round(100.0 * val_score / val_total, 1) if val_total > 0 else 0.0
    row.extras = extras
    await db.commit()
    await db.refresh(row)
    assessment_event, assessment_created = await emit_trusted_event(
        db,
        user_id=current_user.id,
        event=EventInput(
            event_type="assessment.completed",
            source="quiz_results",
            entity_type="lesson",
            entity_id=str(body.set_id),
            metadata={"percentage": extras.get("percentage", 0), "quiz_result_id": str(row.id)},
            idempotency_key=f"quiz-result:{row.id}:completed",
            occurred_at=row.completed_at or datetime.now(UTC),
        ),
    )
    celebration_events = events_for_trusted_row(assessment_event) if assessment_created else []
    lesson_event, lesson_created = await emit_trusted_event(
        db, user_id=current_user.id, event=EventInput(
            event_type="lesson.completed", source="quiz_results", entity_type="lesson", entity_id=str(body.set_id),
            metadata={"quiz_result_id": str(row.id)}, idempotency_key=f"quiz-result:{row.id}:lesson-completed",
            occurred_at=row.completed_at or datetime.now(UTC),
        ),
    )
    if lesson_created:
        celebration_events.extend(events_for_trusted_row(lesson_event, title="Quiz lesson complete"))
    if settings.ENGAGEMENT_SCORECARDS_ENABLED:
        await refresh_current_scorecards(db, current_user.id, affected_set_id=body.set_id)
    enriched = await _enrich_extras_for_results(db, [row])
    try:
        # Send by name so the API process never imports task modules at startup (avoids
        # accidental cycles with celery_app ↔ task packages).
        from tasks.celery_app import celery as celery_app

        celery_app.send_task("tasks.leaderboard_tasks.refresh_leaderboard_task")
    except Exception as exc:
        log.warning("leaderboard refresh enqueue failed: %s", exc)
    return enriched[0].model_copy(update={"celebration_events": celebration_events})


@router.get("/{result_id}", response_model=QuizResultOut)
async def get_quiz_result(
    result_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> QuizResultOut:
    r = await db.execute(
        select(QuizResult).where(
            QuizResult.id == result_id,
            QuizResult.user_id == current_user.id,
        ),
    )
    row = r.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Quiz result not found")
    enriched = await _enrich_extras_for_results(db, [row])
    return enriched[0]
