from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from database import get_db
from dependencies import enforce_tier_limit, get_current_user
from models.book import Book
from models.enums import QuizChallengeStatus
from models.flashcard import Flashcard, FlashcardSet
from models.quiz import QuizChallenge
from models.user import User
from schemas.flashcards_api import (
    FlashcardOut,
    FlashcardSetCreate,
    FlashcardSetOut,
    FlashcardSetUpdate,
    GenerateFlashcardsRequest,
    ScenarioOut,
    flashcard_set_meta_from_description,
)
from schemas.job import JobEnqueueResponse
from tasks.ai_tasks import generate_flashcards_task

router = APIRouter(tags=["flashcards"])


async def _book_title(db: AsyncSession, book_id: UUID | None) -> str | None:
    if book_id is None:
        return None
    r = await db.execute(select(Book.title).where(Book.id == book_id))
    return r.scalar_one_or_none()


async def _serialize_set(db: AsyncSession, s: FlashcardSet, *, include_cards: bool = True) -> FlashcardSetOut:
    bt = await _book_title(db, s.book_id)
    meta = flashcard_set_meta_from_description(s.description)
    summary_text = str(meta.get("summary") or "").strip() or None
    scenario_rows = [
        ScenarioOut(
            type=str(sc.get("type", "real_life")),
            title=str(sc.get("title", "")),
            context=str(sc.get("context", "")),
            challenge=str(sc.get("challenge", "")),
            question=str(sc.get("question", sc.get("prompt", ""))),
            model_answer=str(sc.get("model_answer", "")),
            explanation=str(sc.get("explanation", "")),
            prompt=str(sc.get("prompt", sc.get("question", ""))),
            guidance=str(sc.get("guidance", "")),
        )
        for sc in (meta.get("scenarios") or [])
        if isinstance(sc, dict) and sc.get("title")
    ]
    if include_cards:
        cr = await db.execute(select(Flashcard).where(Flashcard.set_id == s.id).order_by(Flashcard.created_at))
        cards = cr.scalars().all()
        card_count = len(cards)
        card_rows = [
            FlashcardOut(
                id=c.id,
                set_id=c.set_id,
                front=c.front,
                back=c.back,
                created_at=c.created_at,
                chapter=c.chapter,
                difficulty=c.difficulty,
                cognitive_level=c.cognitive_level,
            )
            for c in cards
        ]
    else:
        card_rows = []
        n = await db.scalar(select(func.count(Flashcard.id)).where(Flashcard.set_id == s.id))
        card_count = int(n or 0)
    return FlashcardSetOut(
        id=s.id,
        user_id=s.user_id,
        book_id=s.book_id,
        title=s.title,
        description=s.description,
        tags=list(s.tags) if isinstance(s.tags, list) else [],
        created_at=s.created_at,
        updated_at=s.updated_at,
        book_title=bt,
        cards=card_rows,
        card_count=card_count,
        selected_chapters=list(meta.get("selected_chapters") or []),
        summary=summary_text,
        scenarios=scenario_rows,
        chapter_summaries=list(meta.get("chapter_summaries") or []),
        generation_seed=meta.get("generation_seed"),
    )


async def _assert_free_tier_card_headroom(user: User, db: AsyncSession, extra_cards: int) -> None:
    if not settings.FREE_TIER_PAYWALL_ENABLED:
        return

    if user.subscription_tier != "free":
        return
    n = await db.scalar(
        select(func.count(Flashcard.id))
        .select_from(Flashcard)
        .join(FlashcardSet, Flashcard.set_id == FlashcardSet.id)
        .where(FlashcardSet.user_id == user.id),
    )
    if int(n or 0) + extra_cards > 20:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "UPGRADE_REQUIRED",
                "message": "Free plan limit reached (20 cards). Upgrade to Student plan.",
                "limit": 20,
                "upgrade_url": "/billing/checkout",
            },
        )


@router.post("/", response_model=FlashcardSetOut, status_code=status.HTTP_201_CREATED)
async def create_flashcard_set(
    body: FlashcardSetCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[None, Depends(enforce_tier_limit("flashcard_sets"))],
) -> FlashcardSetOut:
    if body.book_id is not None:
        br = await db.execute(select(Book).where(Book.id == body.book_id, Book.user_id == current_user.id))
        if br.scalar_one_or_none() is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Book not found")
    tags = list(body.tags) if body.tags is not None else []
    s = FlashcardSet(
        user_id=current_user.id,
        book_id=body.book_id,
        title=body.title,
        description=body.description,
        tags=tags,
    )
    db.add(s)
    await db.commit()
    await db.refresh(s)
    return await _serialize_set(db, s)


@router.post("/generate", response_model=JobEnqueueResponse, status_code=status.HTTP_202_ACCEPTED)
async def enqueue_generate_flashcards(
    body: GenerateFlashcardsRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[None, Depends(enforce_tier_limit("flashcard_sets"))],
) -> JobEnqueueResponse:
    await _assert_free_tier_card_headroom(current_user, db, int(body.num_cards))
    br = await db.execute(
        select(Book).where(Book.id == body.book_id, Book.user_id == current_user.id),
    )
    if br.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Book not found")
    task = generate_flashcards_task.delay(
        str(body.book_id),
        str(current_user.id),
        body.title,
        int(body.num_cards),
        selected_chapters=body.selected_chapters,
    )
    return JobEnqueueResponse(job_id=task.id)


@router.get("/", response_model=list[FlashcardSetOut])
async def list_flashcard_sets(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    include_cards: bool = Query(
        False,
        description="When false, cards is empty and card_count is populated (recommended for list/mobile).",
    ),
) -> list[FlashcardSetOut]:
    r = await db.execute(
        select(FlashcardSet)
        .where(FlashcardSet.user_id == current_user.id)
        .order_by(FlashcardSet.created_at.desc()),
    )
    rows = r.scalars().all()
    out: list[FlashcardSetOut] = []
    for s in rows:
        out.append(await _serialize_set(db, s, include_cards=include_cards))
    return out


@router.get("/{set_id}", response_model=FlashcardSetOut)
async def get_flashcard_set(
    set_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FlashcardSetOut:
    r = await db.execute(
        select(FlashcardSet).where(FlashcardSet.id == set_id, FlashcardSet.user_id == current_user.id),
    )
    s = r.scalar_one_or_none()
    if s is not None:
        return await _serialize_set(db, s)
    # Opponent may read the challenger's deck while a challenge is pending/active.
    ch_r = await db.execute(
        select(QuizChallenge).where(
            QuizChallenge.set_id == set_id,
            QuizChallenge.challengee_id == current_user.id,
            QuizChallenge.status.in_((QuizChallengeStatus.pending, QuizChallengeStatus.active)),
        ).limit(1),
    )
    ch = ch_r.scalar_one_or_none()
    if ch is not None:
        s2 = await db.get(FlashcardSet, set_id)
        # Deck must belong to the challenger who created the challenge (no arbitrary set_id reads).
        if s2 is None or s2.user_id != ch.challenger_id:
            raise HTTPException(status_code=404, detail="Set not found")
        return await _serialize_set(db, s2)
    raise HTTPException(status_code=404, detail="Set not found")


@router.put("/{set_id}", response_model=FlashcardSetOut)
async def update_flashcard_set(
    set_id: UUID,
    body: FlashcardSetUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FlashcardSetOut:
    r = await db.execute(
        select(FlashcardSet).where(FlashcardSet.id == set_id, FlashcardSet.user_id == current_user.id),
    )
    s = r.scalar_one_or_none()
    if s is None:
        raise HTTPException(status_code=404, detail="Set not found")
    if body.title is not None:
        s.title = body.title
    if body.description is not None:
        s.description = body.description
    if body.tags is not None:
        s.tags = body.tags
    await db.commit()
    await db.refresh(s)
    return await _serialize_set(db, s)
