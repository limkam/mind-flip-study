from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import get_current_user
from models.flashcard import Flashcard, FlashcardSet
from models.quiz import CardProgress
from models.user import User
from schemas.quiz_api import CardProgressOut, CardProgressUpsert

router = APIRouter(tags=["card-progress"])


@router.get("/", response_model=list[CardProgressOut])
async def list_my_progress(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[CardProgress]:
    r = await db.execute(select(CardProgress).where(CardProgress.user_id == current_user.id))
    return list(r.scalars().all())


@router.put("/by-card/{card_id}", response_model=CardProgressOut)
async def upsert_progress_for_card(
    card_id: UUID,
    body: CardProgressUpsert,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CardProgress:
    cr = await db.execute(select(Flashcard).where(Flashcard.id == card_id))
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
            CardProgress.card_id == card_id,
        ),
    )
    row = pr.scalar_one_or_none()
    if row is None:
        row = CardProgress(
            user_id=current_user.id,
            card_id=card_id,
            ease_factor=body.ease_factor if body.ease_factor is not None else 2.5,
            interval_days=body.interval_days if body.interval_days is not None else 1,
            repetitions=body.repetitions if body.repetitions is not None else 0,
            next_review_date=body.next_review_date,
            last_reviewed_at=body.last_reviewed_at,
            times_correct=body.times_correct if body.times_correct is not None else 0,
            times_incorrect=body.times_incorrect if body.times_incorrect is not None else 0,
        )
        db.add(row)
    else:
        row.next_review_date = body.next_review_date
        if body.ease_factor is not None:
            row.ease_factor = body.ease_factor
        if body.interval_days is not None:
            row.interval_days = body.interval_days
        if body.repetitions is not None:
            row.repetitions = body.repetitions
        if body.last_reviewed_at is not None:
            row.last_reviewed_at = body.last_reviewed_at
        if body.times_correct is not None:
            row.times_correct = body.times_correct
        if body.times_incorrect is not None:
            row.times_incorrect = body.times_incorrect
    await db.commit()
    await db.refresh(row)
    return row
