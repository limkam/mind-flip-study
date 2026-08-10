"""Tests for XP Ledger, server-side score validation, daily review, and Leaderboard V2."""

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from models.flashcard import Flashcard
from services.xp_service import (
    XP_CARD_MASTERY,
    XP_DAILY_REVIEW,
    XP_PER_CORRECT_ANSWER,
    XP_QUIZ_COMPLETION,
    XP_STREAK_3_DAY,
    XP_STREAK_7_DAY,
    XP_STREAK_30_DAY,
    get_current_utc_week_bounds,
    is_card_mastered,
    process_quiz_completion_xp,
)


def test_utc_week_bounds():
    now = datetime(2026, 8, 7, 12, 0, 0, tzinfo=UTC)  # Friday
    w_start, w_end = get_current_utc_week_bounds(now)

    # Monday of that week is Aug 3, 2026
    assert w_start == datetime(2026, 8, 3, 0, 0, 0, tzinfo=UTC)
    # Next Monday is Aug 10, 2026
    assert w_end == datetime(2026, 8, 10, 0, 0, 0, tzinfo=UTC)
    assert (w_end - w_start).days == 7


def test_is_card_mastered_rule():
    # Rule: repetitions >= 3 OR (repetitions >= 1 AND ease_factor >= 2.5)
    assert is_card_mastered(3, 2.0) is True
    assert is_card_mastered(1, 2.5) is True
    assert is_card_mastered(1, 2.4) is False
    assert is_card_mastered(0, 2.8) is False


def test_xp_constant_values():
    assert XP_QUIZ_COMPLETION == 20
    assert XP_PER_CORRECT_ANSWER == 2
    assert XP_DAILY_REVIEW == 30
    assert XP_CARD_MASTERY == 10
    assert XP_STREAK_3_DAY == 30
    assert XP_STREAK_7_DAY == 75
    assert XP_STREAK_30_DAY == 250


def _mock_db_with_cards(cards: list[Flashcard]) -> AsyncMock:
    db = AsyncMock(spec=AsyncSession)
    res = MagicMock()
    res.scalars.return_value = MagicMock(all=MagicMock(return_value=cards))
    db.execute.return_value = res
    db.scalar.return_value = None
    return db


@pytest.mark.asyncio
async def test_quiz_completion_untrusted_client_score_ignored():
    user_id = uuid4()
    set_id = uuid4()
    card1_id = uuid4()
    card2_id = uuid4()

    c1 = Flashcard(id=card1_id, set_id=set_id, front="Q1", back="Answer 1")
    c2 = Flashcard(id=card2_id, set_id=set_id, front="Q2", back="Answer 2")
    db = _mock_db_with_cards([c1, c2])

    quiz_result_id = uuid4()
    # Client lies and claims score=99999 without providing valid answers
    val_score, val_total, xp_awarded = await process_quiz_completion_xp(
        db,
        user_id=user_id,
        quiz_result_id=quiz_result_id,
        set_id=set_id,
        client_score=99999,
        client_total=99999,
        submitted_answers=None,
    )

    # Server ignores client score and total, sets total to 2 flashcards, score to 0
    assert val_total == 2
    assert val_score == 0
    # Awards base completion XP (+20), 0 correct answer XP
    assert xp_awarded == 20


@pytest.mark.asyncio
async def test_quiz_completion_verified_correct_answers():
    user_id = uuid4()
    set_id = uuid4()
    card1_id = uuid4()
    card2_id = uuid4()

    c1 = Flashcard(id=card1_id, set_id=set_id, front="Q1", back="Berlin")
    c2 = Flashcard(id=card2_id, set_id=set_id, front="Q2", back="Tokyo")
    db = _mock_db_with_cards([c1, c2])

    quiz_result_id = uuid4()
    submitted = [
        {"card_id": str(card1_id), "user_answer": "Berlin"},
        {"card_id": str(card2_id), "user_answer": "Wrong Answer"},
    ]

    val_score, val_total, xp_awarded = await process_quiz_completion_xp(
        db,
        user_id=user_id,
        quiz_result_id=quiz_result_id,
        set_id=set_id,
        client_score=2,
        client_total=2,
        submitted_answers=submitted,
    )

    assert val_total == 2
    assert val_score == 1  # Exactly 1 verified correct answer
    assert xp_awarded == 20 + 2  # 20 base + 2 for 1 correct answer


@pytest.mark.asyncio
async def test_quiz_attempt_idempotency_prevents_duplicate_xp():
    user_id = uuid4()
    set_id = uuid4()
    c1 = Flashcard(id=uuid4(), set_id=set_id, front="Q1", back="A1")
    db = _mock_db_with_cards([c1])

    attempt_id = f"attempt-{uuid4()}"
    res1 = await process_quiz_completion_xp(
        db,
        user_id=user_id,
        quiz_result_id=uuid4(),
        set_id=set_id,
        client_score=1,
        client_total=1,
        attempt_id=attempt_id,
    )
    assert res1[2] == 20

    # Simulate existing transaction return on duplicate replay
    from models.xp import XPTransaction
    db.scalar.return_value = XPTransaction(
        user_id=user_id,
        amount=20,
        action_type="quiz_completion",
        source_type="quiz_result",
        source_id=attempt_id,
    )

    res2 = await process_quiz_completion_xp(
        db,
        user_id=user_id,
        quiz_result_id=uuid4(),
        set_id=set_id,
        client_score=1,
        client_total=1,
        attempt_id=attempt_id,
    )
    # 0 additional XP awarded on replay
    assert res2[2] == 0
