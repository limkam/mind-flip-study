"""SM-2 study progress and due-card queue."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import Date, and_, literal, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import get_current_user
from models.book import Book
from models.flashcard import Flashcard, FlashcardSet
from models.quiz import CardProgress, StudyEvent
from models.user import User
from schemas.quiz_api import CardProgressOut, DueFlashcardOut, StudyProgressIn
from services.learning_pace import adjusted_due_limit, adjust_next_review_date
from services.spaced_rep import compute_sm2

router = APIRouter(tags=["study"])


class StudyClientEventIn(BaseModel):
    event_type: str = Field(..., min_length=1, max_length=64)
    set_id: UUID | None = None
    metadata: dict[str, Any] | None = None


@router.post("/progress", response_model=CardProgressOut, status_code=status.HTTP_200_OK)
async def post_study_progress(
    body: StudyProgressIn,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CardProgress:
    # Card must exist; set must belong to current_user (forged card_id / peer sets → 403/404).
    cr = await db.execute(select(Flashcard).where(Flashcard.id == body.card_id))
    card = cr.scalar_one_or_none()
    if card is None:
        raise HTTPException(status_code=404, detail="Card not found")
    sr = await db.execute(
        select(FlashcardSet).where(FlashcardSet.id == card.set_id, FlashcardSet.user_id == current_user.id),
    )
    if sr.scalar_one_or_none() is None:
        raise HTTPException(status_code=403, detail="Not your flashcard")

    pr = await db.execute(
        select(CardProgress).where(
            CardProgress.user_id == current_user.id,
            CardProgress.card_id == body.card_id,
        ),
    )
    row = pr.scalar_one_or_none()
    if row is None:
        row = CardProgress(
            user_id=current_user.id,
            card_id=body.card_id,
            ease_factor=2.5,
            interval_days=1,
            repetitions=0,
            next_review_date=None,
            times_correct=0,
            times_incorrect=0,
        )
        db.add(row)
        await db.flush()

    # SM-2: branch on pre-review ``repetitions``; only then update the counter
    # (fail → 0, pass → increment after interval/EF are computed).
    review_day = datetime.now(timezone.utc).date()
    sm2 = compute_sm2(
        body.quality,
        row.ease_factor,
        row.interval_days,
        row.repetitions,
        review_date=review_day,
    )
    if body.quality < 3:
        row.repetitions = 0
        row.times_incorrect += 1
    else:
        row.repetitions = row.repetitions + 1
        row.times_correct += 1

    row.ease_factor = sm2.ease_factor
    row.interval_days = sm2.interval_days
    row.next_review_date = adjust_next_review_date(
        sm2.next_review_date,
        review_day,
        current_user.preferences,
    )
    row.last_reviewed_at = datetime.now(timezone.utc)

    # set_id always set from the card row (required for downstream analytics joins).
    db.add(
        StudyEvent(
            user_id=current_user.id,
            card_id=body.card_id,
            set_id=card.set_id,
            event_type="review",
            quality=body.quality,
            score=None,
        ),
    )
    await db.commit()
    await db.refresh(row)
    return row


@router.get("/due-cards", response_model=list[DueFlashcardOut])
async def get_due_cards(
    set_id: Annotated[UUID, Query(..., description="Flashcard set UUID")],
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(20, ge=1, le=100),
) -> list[DueFlashcardOut]:
    limit = adjusted_due_limit(limit, current_user.preferences)
    # Same 404 whether the set is missing or not owned — avoids leaking set existence.
    own = await db.execute(
        select(FlashcardSet.id).where(FlashcardSet.id == set_id, FlashcardSet.user_id == current_user.id),
    )
    if own.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Set not found")

    # Match ``compute_sm2`` / ``next_review_date`` using UTC calendar day (not session TZ).
    today_utc = datetime.now(timezone.utc).date()
    today_lit = literal(today_utc, type_=Date())
    stmt = (
        select(
            Flashcard,
            FlashcardSet.title,
            FlashcardSet.book_id,
            CardProgress.ease_factor,
            CardProgress.interval_days,
            CardProgress.next_review_date,
            CardProgress.repetitions,
        )
        .join(FlashcardSet, FlashcardSet.id == Flashcard.set_id)
        .outerjoin(
            CardProgress,
            and_(
                CardProgress.card_id == Flashcard.id,
                CardProgress.user_id == current_user.id,
            ),
        )
        .where(
            Flashcard.set_id == set_id,
            FlashcardSet.user_id == current_user.id,
            or_(
                CardProgress.id.is_(None),
                CardProgress.next_review_date.is_(None),
                CardProgress.next_review_date <= today_lit,
            ),
        )
        .order_by(CardProgress.next_review_date.asc().nullsfirst())
        .limit(limit)
    )
    r = await db.execute(stmt)
    rows = r.all()
    book_ids = {bid for _, _, bid, _, _, _, _ in rows if bid}
    book_titles: dict[Any, str] = {}
    if book_ids:
        br = await db.execute(select(Book).where(Book.id.in_(book_ids)))
        book_titles = {b.id: b.title for b in br.scalars().all()}

    out: list[DueFlashcardOut] = []
    for flashcard, set_title, book_id, ef, iv, nrd, rep in rows:
        out.append(
            DueFlashcardOut(
                id=flashcard.id,
                set_id=flashcard.set_id,
                front=flashcard.front,
                back=flashcard.back,
                created_at=flashcard.created_at,
                set_title=set_title,
                chapter=flashcard.chapter,
                difficulty=flashcard.difficulty,
                book_id=book_id,
                book_title=book_titles.get(book_id) if book_id else None,
                ease_factor=ef,
                interval_days=iv,
                next_review_date=nrd,
                repetitions=rep,
            ),
        )
    return out


@router.get("/daily-review", response_model=list[DueFlashcardOut])
async def get_daily_review_queue(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(50, ge=1, le=200),
    book_id: UUID | None = Query(None),
    book_ids: list[UUID] | None = Query(None),
    set_id: UUID | None = Query(None),
    chapter: str | None = Query(None, max_length=512),
    subject: str | None = Query(None, max_length=128),
) -> list[DueFlashcardOut]:
    """Cross-set due cards with optional scope filters."""
    limit = adjusted_due_limit(limit, current_user.preferences)
    today_utc = datetime.now(timezone.utc).date()
    today_lit = literal(today_utc, type_=Date())

    stmt = (
        select(
            Flashcard,
            FlashcardSet.title,
            FlashcardSet.book_id,
            CardProgress.ease_factor,
            CardProgress.interval_days,
            CardProgress.next_review_date,
            CardProgress.repetitions,
        )
        .join(FlashcardSet, FlashcardSet.id == Flashcard.set_id)
        .outerjoin(
            CardProgress,
            and_(
                CardProgress.card_id == Flashcard.id,
                CardProgress.user_id == current_user.id,
            ),
        )
        .where(
            FlashcardSet.user_id == current_user.id,
            or_(
                CardProgress.id.is_(None),
                CardProgress.next_review_date.is_(None),
                CardProgress.next_review_date <= today_lit,
            ),
        )
    )
    if set_id is not None:
        stmt = stmt.where(Flashcard.set_id == set_id)
    if book_ids:
        stmt = stmt.where(FlashcardSet.book_id.in_(book_ids))
    elif book_id is not None:
        stmt = stmt.where(FlashcardSet.book_id == book_id)
    if chapter:
        stmt = stmt.where(Flashcard.chapter == chapter)
    if subject:
        stmt = stmt.join(Book, Book.id == FlashcardSet.book_id).where(
            Book.extras["subject"].astext == subject,
        )

    stmt = stmt.order_by(CardProgress.next_review_date.asc().nullsfirst()).limit(limit)
    r = await db.execute(stmt)
    rows = r.all()
    book_ids = {bid for _, _, bid, _, _, _, _ in rows if bid}
    book_titles: dict[Any, str] = {}
    if book_ids:
        br = await db.execute(select(Book).where(Book.id.in_(book_ids)))
        book_titles = {b.id: b.title for b in br.scalars().all()}

    out: list[DueFlashcardOut] = []
    for flashcard, set_title, b_id, ef, iv, nrd, rep in rows:
        out.append(
            DueFlashcardOut(
                id=flashcard.id,
                set_id=flashcard.set_id,
                front=flashcard.front,
                back=flashcard.back,
                created_at=flashcard.created_at,
                set_title=set_title,
                chapter=flashcard.chapter,
                difficulty=flashcard.difficulty,
                book_id=b_id,
                book_title=book_titles.get(b_id) if b_id else None,
                ease_factor=ef,
                interval_days=iv,
                next_review_date=nrd,
                repetitions=rep,
            ),
        )
    return out


@router.post("/events", status_code=status.HTTP_204_NO_CONTENT)
async def log_client_event(
    body: StudyClientEventIn,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    db.add(
        StudyEvent(
            user_id=current_user.id,
            card_id=None,
            set_id=body.set_id,
            event_type=body.event_type,
            quality=None,
            score=None,
        ),
    )
    await db.commit()
