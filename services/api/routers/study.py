"""SM-2 study progress and due-card queue."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import Date, and_, literal, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import get_current_user
from models.flashcard import Flashcard, FlashcardSet
from models.quiz import CardProgress, StudyEvent
from models.user import User
from schemas.quiz_api import CardProgressOut, DueFlashcardOut, StudyProgressIn
from services.spaced_rep import compute_sm2

router = APIRouter(tags=["study"])


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
    row.next_review_date = sm2.next_review_date
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
    out: list[DueFlashcardOut] = []
    for flashcard, set_title, ef, iv, nrd, rep in r.all():
        out.append(
            DueFlashcardOut(
                id=flashcard.id,
                set_id=flashcard.set_id,
                front=flashcard.front,
                back=flashcard.back,
                created_at=flashcard.created_at,
                set_title=set_title,
                ease_factor=ef,
                interval_days=iv,
                next_review_date=nrd,
                repetitions=rep,
            ),
        )
    return out
