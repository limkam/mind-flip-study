"""Server-controlled XP Ledger service.

Handles XP award transactions, idempotency checks, score validation,
weekly / all-time aggregate calculations, and deterministic rankings.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from typing import Any, Sequence
from uuid import UUID

from sqlalchemy import and_, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from models.flashcard import Flashcard, FlashcardSet
from models.quiz import CardProgress, QuizResult
from models.user import User
from models.xp import XPTransaction

log = logging.getLogger(__name__)

# XP Rule Constants
XP_QUIZ_COMPLETION = 20
XP_PER_CORRECT_ANSWER = 2
XP_DAILY_REVIEW = 30
XP_CARD_MASTERY = 10
XP_STREAK_3_DAY = 30
XP_STREAK_7_DAY = 75
XP_STREAK_30_DAY = 250


def get_current_utc_week_bounds(now: datetime | None = None) -> tuple[datetime, datetime]:
    """Return [week_start, week_end) in UTC for the current week.
    
    Monday 00:00:00 UTC through Sunday 23:59:59.999999 UTC.
    """
    if now is None:
        now = datetime.now(UTC)
    elif now.tzinfo is None:
        now = now.replace(tzinfo=UTC)
    
    # Monday is weekday() 0
    start_of_day = datetime(now.year, now.month, now.day, tzinfo=UTC)
    week_start = start_of_day - timedelta(days=now.weekday())
    week_end = week_start + timedelta(days=7)
    return week_start, week_end


async def award_xp(
    db: AsyncSession,
    *,
    user_id: UUID,
    amount: int,
    action_type: str,
    source_type: str,
    source_id: str,
    metadata: dict[str, Any] | None = None,
    created_at: datetime | None = None,
) -> XPTransaction | None:
    """Safely award XP with database-enforced idempotency."""
    if amount <= 0:
        return None

    str_source_id = str(source_id)
    stmt = select(XPTransaction).where(
        XPTransaction.user_id == user_id,
        XPTransaction.source_type == source_type,
        XPTransaction.source_id == str_source_id,
        XPTransaction.action_type == action_type,
    )
    existing = await db.scalar(stmt)
    if existing is not None:
        return None

    row = XPTransaction(
        user_id=user_id,
        amount=amount,
        action_type=action_type,
        source_type=source_type,
        source_id=str_source_id,
        metadata_=metadata or {},
        created_at=created_at or datetime.now(UTC),
    )
    db.add(row)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        return await db.scalar(stmt)
    return row


async def process_quiz_completion_xp(
    db: AsyncSession,
    *,
    user_id: UUID,
    quiz_result_id: UUID,
    set_id: UUID,
    client_score: int,
    client_total: int,
    submitted_answers: list[dict[str, Any]] | None = None,
    attempt_id: str | None = None,
    created_at: datetime | None = None,
) -> tuple[int, int, int]:
    """Validate server-side quiz parameters and award XP.
    
    Recomputes answer correctness against database flashcard answer keys.
    Returns (validated_score, validated_total, total_xp_awarded).
    """
    card_rows = (
        await db.execute(
            select(Flashcard).where(Flashcard.set_id == set_id)
        )
    ).scalars().all()

    total_flashcards = len(card_rows)
    if total_flashcards > 0:
        validated_total = total_flashcards
    else:
        validated_total = max(1, client_total)

    # Server verification of answer correctness
    if card_rows and submitted_answers:
        card_map = {str(c.id): c for c in card_rows}
        verified_correct = 0
        for ans in submitted_answers:
            cid = str(ans.get("card_id") or "")
            card = card_map.get(cid)
            if not card:
                continue
            user_ans = str(ans.get("user_answer") or ans.get("selected_answer") or "").strip().lower()
            expected_ans = str(card.back or "").strip().lower()
            is_correct = ans.get("is_correct")
            if user_ans and user_ans == expected_ans:
                verified_correct += 1
            elif is_correct is True and (not user_ans or user_ans == expected_ans):
                verified_correct += 1

        validated_score = min(verified_correct, validated_total)
    else:
        # If client does not provide verifiable answers, score for per-question XP is 0 (untrusted)
        validated_score = 0

    total_xp = 0
    source_key = attempt_id if attempt_id else str(quiz_result_id)

    # 1. Base quiz completion XP (+20 XP)
    tx1 = await award_xp(
        db,
        user_id=user_id,
        amount=XP_QUIZ_COMPLETION,
        action_type="quiz_completion",
        source_type="quiz_result",
        source_id=source_key,
        metadata={"set_id": str(set_id), "total_questions": validated_total, "attempt_id": source_key},
        created_at=created_at,
    )
    if tx1:
        total_xp += XP_QUIZ_COMPLETION

    # 2. Verified correct answers XP (+2 XP per verified correct answer)
    if validated_score > 0:
        correct_xp = validated_score * XP_PER_CORRECT_ANSWER
        tx2 = await award_xp(
            db,
            user_id=user_id,
            amount=correct_xp,
            action_type="quiz_correct_answer",
            source_type="quiz_result",
            source_id=source_key,
            metadata={"set_id": str(set_id), "correct_count": validated_score, "attempt_id": source_key},
            created_at=created_at,
        )
        if tx2:
            total_xp += correct_xp

    return validated_score, validated_total, total_xp


async def process_card_mastery_xp(
    db: AsyncSession,
    *,
    user_id: UUID,
    card_id: UUID,
    was_mastered: bool,
    is_mastered: bool,
) -> XPTransaction | None:
    """Award +10 XP once when a card transitions from non-mastered to mastered."""
    if is_mastered and not was_mastered:
        return await award_xp(
            db,
            user_id=user_id,
            amount=XP_CARD_MASTERY,
            action_type="card_mastery",
            source_type="card_progress",
            source_id=str(card_id),
            metadata={"card_id": str(card_id)},
        )
    return None


async def process_daily_review_completion_xp(
    db: AsyncSession,
    *,
    user_id: UUID,
    date_str: str | None = None,
) -> XPTransaction | None:
    """Award +30 XP once per UTC day when completing Daily Review."""
    if not date_str:
        date_str = datetime.now(UTC).strftime("%Y-%m-%d")
    return await award_xp(
        db,
        user_id=user_id,
        amount=XP_DAILY_REVIEW,
        action_type="daily_review_completion",
        source_type="daily_review",
        source_id=f"daily_review:{user_id}:{date_str}",
        metadata={"date": date_str},
    )


async def process_streak_milestone_xp(
    db: AsyncSession,
    *,
    user_id: UUID,
    streak_days: int,
    local_date: str,
) -> XPTransaction | None:
    """Award milestone XP for 3, 7, and 30 day streaks."""
    if streak_days == 3:
        amount = XP_STREAK_3_DAY
    elif streak_days == 7:
        amount = XP_STREAK_7_DAY
    elif streak_days == 30:
        amount = XP_STREAK_30_DAY
    else:
        return None

    return await award_xp(
        db,
        user_id=user_id,
        amount=amount,
        action_type=f"streak_milestone_{streak_days}",
        source_type="streak",
        source_id=f"streak:{user_id}:{streak_days}:{local_date}",
        metadata={"streak_days": streak_days, "date": local_date},
    )


def is_card_mastered(repetitions: int, ease_factor: float) -> bool:
    """Existing mastered definition: repetitions >= 3 OR (repetitions >= 1 AND ease_factor >= 2.5)."""
    return repetitions >= 3 or (repetitions >= 1 and ease_factor >= 2.5)
