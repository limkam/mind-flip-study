from __future__ import annotations

import asyncio
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ai_generation import find_existing_flashcard_set
from ai_credits import record_ai_generation_sync
from database import get_db
from database_sync import sync_session
from dependencies import get_current_user
from generation_prompts import GENERATION_PIPELINE_VERSION
from models.book import Book
from models.enums import QuizChallengeStatus
from models.flashcard import Flashcard, FlashcardSet
from models.quiz import QuizChallenge
from models.user import User
from scenario_regeneration import regenerate_all_scenarios_sync, replace_set_scenarios_in_description
from services import credits
from services.entitlements import (
    Action as EntitlementAction,
    _plan_features,
    _user_plan_slug,
    can_user_do,
)
from schemas.flashcards_api import (
    FlashcardOut,
    FlashcardSetCreate,
    FlashcardSetOut,
    FlashcardSetUpdate,
    GenerateFlashcardsRequest,
    RegenerateScenariosResponse,
    ScenarioOut,
    flashcard_set_meta_from_description,
)
from schemas.job import JobEnqueueResponse
from tasks.ai_tasks import generate_flashcards_task

router = APIRouter(tags=["flashcards"])


def _has_complete_scenarios(meta: dict, chapters: list[str]) -> bool:
    if not chapters:
        return False
    scenarios = [
        item
        for item in (meta.get("scenarios") or [])
        if isinstance(item, dict)
        and str(item.get("title") or "").strip()
        and str(item.get("description") or item.get("context") or "").strip()
        and str(item.get("question") or item.get("prompt") or "").strip()
    ]
    return all(
        sum(1 for item in scenarios if str(item.get("chapter") or "").strip() == chapter) == 5
        for chapter in chapters
    )


async def _book_title(db: AsyncSession, book_id: UUID | None) -> str | None:
    if book_id is None:
        return None
    r = await db.execute(select(Book.title).where(Book.id == book_id))
    return r.scalar_one_or_none()


async def _book_titles_map(db: AsyncSession, book_ids: set[UUID]) -> dict[UUID, str]:
    if not book_ids:
        return {}
    r = await db.execute(select(Book.id, Book.title).where(Book.id.in_(book_ids)))
    return {row.id: row.title for row in r.all()}


async def _card_counts_map(db: AsyncSession, set_ids: list[UUID]) -> dict[UUID, int]:
    if not set_ids:
        return {}
    r = await db.execute(
        select(Flashcard.set_id, func.count(Flashcard.id))
        .where(Flashcard.set_id.in_(set_ids))
        .group_by(Flashcard.set_id),
    )
    return {row.set_id: int(row.count) for row in r.all()}


async def _serialize_set(
    db: AsyncSession,
    s: FlashcardSet,
    *,
    include_cards: bool = True,
    book_title: str | None = None,
    card_count: int | None = None,
) -> FlashcardSetOut:
    bt = book_title if book_title is not None else await _book_title(db, s.book_id)
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
            chapter=str(sc.get("chapter", "")),
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
        if card_count is None:
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
    plan_slug = await _user_plan_slug(db, user)
    features = await _plan_features(db, plan_slug)
    per_set_limit = features.get("max_cards_per_set")
    if per_set_limit is not None and extra_cards > int(per_set_limit):
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail={
                "code": "UPGRADE_REQUIRED",
                "message": f"Your plan supports up to {int(per_set_limit)} cards per set.",
                "limit": int(per_set_limit),
            },
        )

@router.post("/", response_model=FlashcardSetOut, status_code=status.HTTP_201_CREATED)
async def create_flashcard_set(
    body: FlashcardSetCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FlashcardSetOut:
    ent = await can_user_do(db, current_user, EntitlementAction.CREATE_SET)
    if not ent.get("allowed"):
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail={
                "code": "UPGRADE_REQUIRED",
                "message": "Your flashcard-set allowance has been reached.",
                "reason": ent.get("reason"),
            },
        )
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
) -> JobEnqueueResponse:
    chapters = [c.strip() for c in (body.selected_chapters or []) if c and str(c).strip()]
    if not chapters:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Select a chapter before generating flashcards.",
        )
    if len(chapters) > 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Select only one chapter at a time for flashcard generation.",
        )
    await _assert_free_tier_card_headroom(current_user, db, int(body.num_cards))
    br = await db.execute(
        select(Book).where(Book.id == body.book_id, Book.user_id == current_user.id),
    )
    book = br.scalar_one_or_none()
    if book is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Book not found")

    if not body.force_regenerate:
        existing_id: UUID | None = None
        existing_description: str | None = None
        with sync_session() as sync_db:
            existing = find_existing_flashcard_set(
                sync_db,
                user_id=current_user.id,
                book_id=body.book_id,
                selected_chapters=chapters,
                num_cards=int(body.num_cards),
            )
            if existing is not None:
                existing_id = existing.id
                existing_description = existing.description

        if existing_id is not None:
            existing_meta = flashcard_set_meta_from_description(existing_description)
            if not _has_complete_scenarios(existing_meta, chapters):
                try:
                    completed_scenarios = await asyncio.to_thread(
                        regenerate_all_scenarios_sync,
                        book_title=book.title,
                        meta=existing_meta,
                        user_id=current_user.id,
                    )
                except ValueError as exc:
                    raise HTTPException(
                        status_code=status.HTTP_502_BAD_GATEWAY,
                        detail="The existing study set is incomplete and its scenarios could not be repaired. Please try again.",
                    ) from exc
                existing_row = await db.get(FlashcardSet, existing_id)
                if existing_row is not None:
                    existing_row.description = replace_set_scenarios_in_description(
                        existing_row.description,
                        completed_scenarios,
                    )
                    await db.commit()

            return JobEnqueueResponse(
                job_id=f"existing-{existing_id}",
                set_id=str(existing_id),
                reused=True,
                message="Returning the complete existing flashcard set.",
            )

    ent = await can_user_do(db, current_user, EntitlementAction.CREATE_SET)
    if not ent.get("allowed"):
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail={
                "code": "UPGRADE_REQUIRED",
                "message": "Your plan's flashcard-set allowance has been reached.",
                "reason": ent.get("reason"),
                "upgrade_hook": ent.get("upgrade_hook"),
            },
        )
    consume = ent.get("consume")
    if consume:
        await credits.consume_credits(
            db,
            current_user.id,
            int(consume.get("amount", 1)),
            pool=str(consume.get("pool", "content")),
            reason="create_set",
        )

    task = generate_flashcards_task.delay(
        str(body.book_id),
        str(current_user.id),
        body.title,
        int(body.num_cards),
        selected_chapters=chapters,
        summary_detail_level=body.summary_detail_level,
        pipeline_version=GENERATION_PIPELINE_VERSION,
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
    set_ids = [s.id for s in rows]
    book_ids = {s.book_id for s in rows if s.book_id is not None}
    counts_map = await _card_counts_map(db, set_ids)
    titles_map = await _book_titles_map(db, book_ids)
    out: list[FlashcardSetOut] = []
    for s in rows:
        out.append(
            await _serialize_set(
                db,
                s,
                include_cards=include_cards,
                book_title=titles_map.get(s.book_id) if s.book_id else None,
                card_count=counts_map.get(s.id, 0) if not include_cards else None,
            ),
        )
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


@router.delete("/{set_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_flashcard_set(
    set_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    """Delete a flashcard set and all its cards (owner only)."""
    r = await db.execute(
        select(FlashcardSet).where(FlashcardSet.id == set_id, FlashcardSet.user_id == current_user.id),
    )
    s = r.scalar_one_or_none()
    if s is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Set not found")
    await db.delete(s)
    await db.commit()


@router.post("/{set_id}/scenarios/regenerate", response_model=RegenerateScenariosResponse)
async def regenerate_scenarios(
    set_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> RegenerateScenariosResponse:
    r = await db.execute(
        select(FlashcardSet).where(FlashcardSet.id == set_id, FlashcardSet.user_id == current_user.id),
    )
    s = r.scalar_one_or_none()
    if s is None:
        raise HTTPException(status_code=404, detail="Set not found")

    meta = flashcard_set_meta_from_description(s.description)
    book_title = await _book_title(db, s.book_id) or s.title
    existing_scenarios = [
        sc
        for sc in (meta.get("scenarios") or [])
        if isinstance(sc, dict)
        and str(sc.get("title") or "").strip()
        and str(sc.get("description") or sc.get("context") or "").strip()
        and str(sc.get("question") or sc.get("prompt") or "").strip()
    ]
    chapter_titles = list(dict.fromkeys(
        str(sc.get("chapter") or "").strip()
        for sc in existing_scenarios
        if str(sc.get("chapter") or "").strip()
    )) or [
        str(title).strip()
        for title in (meta.get("selected_chapters") or [])
        if str(title).strip()
    ]
    counts = {
        title: sum(1 for sc in existing_scenarios if str(sc.get("chapter") or "").strip() == title)
        for title in chapter_titles
    }
    is_incomplete = not chapter_titles or any(counts.get(title, 0) != 5 for title in chapter_titles)

    try:
        # Completing a legacy/incomplete scenario set is a correctness repair,
        # not a paid regeneration. Only complete 5-scenario sets use regen credits.
        if not is_incomplete:
            ent = await can_user_do(db, current_user, EntitlementAction.REGENERATE)
            if not ent.get("allowed"):
                raise HTTPException(
                    status_code=status.HTTP_402_PAYMENT_REQUIRED,
                    detail={
                        "code": "UPGRADE_REQUIRED",
                        "message": "Regeneration requires credits or upgrade.",
                        "upgrade_hook": ent.get("upgrade_hook"),
                    },
                )
            consume = ent.get("consume")
            if consume:
                await credits.consume_credits(db, current_user.id, int(consume.get("amount", 1)), pool=consume.get("pool", "regen"), reason="regen")

        new_scenarios = await asyncio.to_thread(
            regenerate_all_scenarios_sync,
            book_title=book_title,
            meta=meta,
            user_id=current_user.id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Scenario regeneration failed: {exc}") from exc

    s.description = replace_set_scenarios_in_description(s.description, new_scenarios)

    with sync_session() as sync_db:
        record_ai_generation_sync(sync_db, user_id=current_user.id, set_id=s.id)
        sync_db.commit()

    await db.commit()
    await db.refresh(s)

    rows = [
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
            chapter=str(sc.get("chapter", "")),
        )
        for sc in new_scenarios
    ]
    return RegenerateScenariosResponse(scenarios=rows)


@router.post("/{set_id}/scenarios/complete", response_model=RegenerateScenariosResponse)
async def complete_incomplete_scenarios(
    set_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> RegenerateScenariosResponse:
    """Repair a malformed legacy set to exactly five scenarios without a credit charge."""
    s = await db.scalar(
        select(FlashcardSet).where(
            FlashcardSet.id == set_id,
            FlashcardSet.user_id == current_user.id,
        ),
    )
    if s is None:
        raise HTTPException(status_code=404, detail="Set not found")

    meta = flashcard_set_meta_from_description(s.description)
    chapters = [str(ch).strip() for ch in (meta.get("selected_chapters") or []) if str(ch).strip()]
    if _has_complete_scenarios(meta, chapters):
        scenarios = [sc for sc in (meta.get("scenarios") or []) if isinstance(sc, dict)]
    else:
        try:
            scenarios = await asyncio.to_thread(
                regenerate_all_scenarios_sync,
                book_title=await _book_title(db, s.book_id) or s.title,
                meta=meta,
                user_id=current_user.id,
            )
        except ValueError as exc:
            raise HTTPException(
                status_code=400,
                detail="The missing scenarios could not be completed from this set's source content.",
            ) from exc
        s.description = replace_set_scenarios_in_description(s.description, scenarios)
        await db.commit()

    rows = [
        ScenarioOut(
            type=str(sc.get("type", "real_life")),
            title=str(sc.get("title", "")),
            context=str(sc.get("context", sc.get("description", ""))),
            challenge=str(sc.get("challenge", "")),
            question=str(sc.get("question", sc.get("prompt", ""))),
            model_answer=str(sc.get("model_answer", "")),
            explanation=str(sc.get("explanation", "")),
            prompt=str(sc.get("prompt", sc.get("question", ""))),
            guidance=str(sc.get("guidance", "")),
            chapter=str(sc.get("chapter", "")),
        )
        for sc in scenarios
        if str(sc.get("title") or "").strip()
    ]
    return RegenerateScenariosResponse(scenarios=rows)
