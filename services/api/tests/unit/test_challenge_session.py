from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi import HTTPException

from models.enums import QuizChallengeStatus
from routers.flashcards import get_flashcard_set
from routers.quiz_challenges import get_challenge_session


class _ScalarResult:
    def __init__(self, value):
        self._value = value

    def scalar_one_or_none(self):
        return self._value


class _Rows:
    def __init__(self, rows):
        self._rows = rows

    def scalars(self):
        return self

    def all(self):
        return self._rows


def _make_challenge(**overrides):
    now = datetime.now(timezone.utc)
    base = dict(
        id=uuid4(),
        challenger_id=uuid4(),
        challengee_id=uuid4(),
        set_id=uuid4(),
        status=QuizChallengeStatus.pending,
        expires_at=now + timedelta(days=6),
        result_data={"set_title": "Bio 101"},
    )
    base.update(overrides)
    return SimpleNamespace(**base)


@pytest.mark.asyncio
async def test_get_flashcard_set_no_longer_exposes_deck_to_challenge_recipient():
    """The old bypass returned the challenger's full deck to any pending-challenge
    recipient with no entitlement check. It must be gone: a non-owner request 404s,
    full stop, with no fallback challenge lookup."""
    current_user = SimpleNamespace(id=uuid4())
    db = SimpleNamespace(execute=AsyncMock(return_value=_ScalarResult(None)))

    with pytest.raises(HTTPException) as exc:
        await get_flashcard_set(set_id=uuid4(), current_user=current_user, db=db)

    assert exc.value.status_code == 404
    # Only the ownership query runs — no second query for a challenge fallback.
    assert db.execute.await_count == 1


@pytest.mark.asyncio
async def test_challenge_session_returns_derived_questions_not_raw_deck(monkeypatch):
    # Free-plan recipient (can_send_challenges disallowed) — must still get a session under the
    # free-sample model, not be gated behind the Challenges plan entitlement.
    monkeypatch.setattr("routers.quiz_challenges.can_user_do", AsyncMock(return_value={"allowed": False}))
    ch = _make_challenge()
    fset = SimpleNamespace(id=ch.set_id, user_id=ch.challenger_id, title="Bio 101")
    cards = [
        SimpleNamespace(id=uuid4(), front=f"Q{i}", back=f"A{i}", chapter=None, difficulty=None, cognitive_level=None)
        for i in range(5)
    ]
    db = SimpleNamespace(
        get=AsyncMock(side_effect=[ch, fset]),
        execute=AsyncMock(return_value=_Rows(cards)),
        scalar=AsyncMock(return_value=0),  # 0 free completions used so far this month
        commit=AsyncMock(),
    )
    current_user = SimpleNamespace(id=ch.challengee_id)

    result = await get_challenge_session(challenge_id=ch.id, current_user=current_user, db=db)

    assert result.set_title == "Bio 101"
    assert len(result.questions) == len(cards)
    fronts = {c.front for c in cards}
    for q in result.questions:
        assert q.question in fronts
        assert q.correct_answer in q.options
    # Response is only derived question data — no raw card id/full-deck listing.
    assert not hasattr(result, "cards")


@pytest.mark.asyncio
async def test_challenge_session_forbidden_for_non_challengee():
    ch = _make_challenge()
    db = SimpleNamespace(get=AsyncMock(return_value=ch))
    outsider = SimpleNamespace(id=uuid4())

    with pytest.raises(HTTPException) as exc:
        await get_challenge_session(challenge_id=ch.id, current_user=outsider, db=db)

    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_challenge_session_rejects_set_not_owned_by_challenger(monkeypatch):
    monkeypatch.setattr(
        "routers.quiz_challenges._challenge_completion_eligibility",
        AsyncMock(return_value={"allowed": True, "free_sample": False}),
    )
    ch = _make_challenge()
    imposter_set = SimpleNamespace(id=ch.set_id, user_id=uuid4(), title="Not the challenger's set")
    db = SimpleNamespace(get=AsyncMock(side_effect=[ch, imposter_set]))
    current_user = SimpleNamespace(id=ch.challengee_id)

    with pytest.raises(HTTPException) as exc:
        await get_challenge_session(challenge_id=ch.id, current_user=current_user, db=db)

    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_challenge_session_expired_returns_410_and_flips_status():
    ch = _make_challenge(expires_at=datetime.now(timezone.utc) - timedelta(days=1))
    db = SimpleNamespace(get=AsyncMock(return_value=ch), commit=AsyncMock())
    current_user = SimpleNamespace(id=ch.challengee_id)

    with pytest.raises(HTTPException) as exc:
        await get_challenge_session(challenge_id=ch.id, current_user=current_user, db=db)

    assert exc.value.status_code == 410
    assert ch.status == QuizChallengeStatus.expired
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_challenge_session_rejects_completed_challenge():
    ch = _make_challenge(status=QuizChallengeStatus.completed)
    db = SimpleNamespace(get=AsyncMock(return_value=ch))
    current_user = SimpleNamespace(id=ch.challengee_id)

    with pytest.raises(HTTPException) as exc:
        await get_challenge_session(challenge_id=ch.id, current_user=current_user, db=db)

    assert exc.value.status_code == 400
