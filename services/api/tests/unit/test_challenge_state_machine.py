from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi import HTTPException

from models.enums import QuizChallengeStatus
from models.quiz import QuizChallenge
from routers.quiz_challenges import patch_challenge


def _make_challenge(**overrides):
    now = datetime.now(timezone.utc)
    base = dict(
        id=uuid4(),
        challenger_id=uuid4(),
        challengee_id=uuid4(),
        set_id=uuid4(),
        status=QuizChallengeStatus.pending,
        expires_at=now + timedelta(days=6),
        created_at=now,
        result_data={"set_title": "Bio 101", "challenger_percentage": 80, "challenger_time_seconds": 100},
    )
    base.update(overrides)
    return SimpleNamespace(**base)


@pytest.mark.asyncio
async def test_patch_rejects_reopening_completed_challenge_to_pending(monkeypatch):
    monkeypatch.setattr("routers.quiz_challenges.can_user_do", AsyncMock(return_value={"allowed": True}))
    ch = _make_challenge(status=QuizChallengeStatus.completed)
    db = SimpleNamespace(get=AsyncMock(return_value=ch))
    current_user = SimpleNamespace(id=ch.challenger_id)

    with pytest.raises(HTTPException) as exc:
        await patch_challenge(challenge_id=ch.id, current_user=current_user, db=db, body={"status": "pending"})

    assert exc.value.status_code == 400
    assert exc.value.detail["code"] == "INVALID_STATUS_TRANSITION"
    assert ch.status == QuizChallengeStatus.completed


@pytest.mark.asyncio
async def test_patch_rejects_arbitrary_jump_to_active(monkeypatch):
    monkeypatch.setattr("routers.quiz_challenges.can_user_do", AsyncMock(return_value={"allowed": True}))
    ch = _make_challenge(status=QuizChallengeStatus.pending)
    db = SimpleNamespace(get=AsyncMock(return_value=ch))
    current_user = SimpleNamespace(id=ch.challenger_id)

    with pytest.raises(HTTPException) as exc:
        await patch_challenge(challenge_id=ch.id, current_user=current_user, db=db, body={"status": "active"})

    assert exc.value.status_code == 400
    assert exc.value.detail["code"] == "INVALID_STATUS_TRANSITION"
    assert ch.status == QuizChallengeStatus.pending


@pytest.mark.asyncio
async def test_patch_rejects_client_requested_expired(monkeypatch):
    """Only the server's own expires_at check may move a challenge to expired."""
    monkeypatch.setattr("routers.quiz_challenges.can_user_do", AsyncMock(return_value={"allowed": True}))
    ch = _make_challenge(status=QuizChallengeStatus.pending)
    db = SimpleNamespace(get=AsyncMock(return_value=ch))
    current_user = SimpleNamespace(id=ch.challengee_id)

    with pytest.raises(HTTPException) as exc:
        await patch_challenge(challenge_id=ch.id, current_user=current_user, db=db, body={"status": "expired"})

    assert exc.value.status_code == 400
    assert exc.value.detail["code"] == "INVALID_STATUS_TRANSITION"


@pytest.mark.asyncio
async def test_patch_rejects_transition_from_active_state(monkeypatch):
    monkeypatch.setattr("routers.quiz_challenges.can_user_do", AsyncMock(return_value={"allowed": True}))
    ch = _make_challenge(status=QuizChallengeStatus.active)
    db = SimpleNamespace(get=AsyncMock(return_value=ch))
    current_user = SimpleNamespace(id=ch.challengee_id)

    with pytest.raises(HTTPException) as exc:
        await patch_challenge(challenge_id=ch.id, current_user=current_user, db=db, body={"status": "completed"})

    assert exc.value.status_code == 400
    assert exc.value.detail["code"] == "INVALID_STATUS_TRANSITION"


@pytest.mark.asyncio
async def test_patch_completing_twice_returns_409_not_generic_400(monkeypatch):
    monkeypatch.setattr("routers.quiz_challenges.can_user_do", AsyncMock(return_value={"allowed": True}))
    ch = _make_challenge(status=QuizChallengeStatus.completed)
    db = SimpleNamespace(get=AsyncMock(return_value=ch))
    current_user = SimpleNamespace(id=ch.challengee_id)

    with pytest.raises(HTTPException) as exc:
        await patch_challenge(challenge_id=ch.id, current_user=current_user, db=db, body={"status": "completed"})

    assert exc.value.status_code == 409
    assert exc.value.detail["code"] == "CHALLENGE_ALREADY_ACCEPTED"


@pytest.mark.asyncio
async def test_patch_expired_challenge_returns_410_and_flips_status(monkeypatch):
    monkeypatch.setattr("routers.quiz_challenges.can_user_do", AsyncMock(return_value={"allowed": True}))
    ch = _make_challenge(status=QuizChallengeStatus.pending, expires_at=datetime.now(timezone.utc) - timedelta(days=1))
    db = SimpleNamespace(get=AsyncMock(return_value=ch), commit=AsyncMock(), refresh=AsyncMock())
    current_user = SimpleNamespace(id=ch.challengee_id)

    with pytest.raises(HTTPException) as exc:
        await patch_challenge(challenge_id=ch.id, current_user=current_user, db=db, body={"status": "completed"})

    assert exc.value.status_code == 410
    assert exc.value.detail["code"] == "CHALLENGE_EXPIRED"
    assert ch.status == QuizChallengeStatus.expired
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_patch_allows_valid_pending_to_completed_transition(monkeypatch):
    monkeypatch.setattr("routers.quiz_challenges.can_user_do", AsyncMock(return_value={"allowed": True}))
    monkeypatch.setattr("routers.quiz_challenges.consume_extra_credits", AsyncMock(return_value=None))
    # A real mapped instance (not SimpleNamespace) so SQLAlchemy's flag_modified() works.
    template = _make_challenge(status=QuizChallengeStatus.pending)
    ch = QuizChallenge(
        id=template.id,
        challenger_id=template.challenger_id,
        challengee_id=template.challengee_id,
        set_id=template.set_id,
        status=template.status,
        expires_at=template.expires_at,
        created_at=template.created_at,
        result_data=dict(template.result_data),
    )
    challenger = SimpleNamespace(id=ch.challenger_id, email="challenger@example.test", full_name="Challenger")
    challengee = SimpleNamespace(id=ch.challengee_id, email="challengee@example.test", full_name="Challengee")
    fset = SimpleNamespace(id=ch.set_id, title="Bio 101")
    db = SimpleNamespace(
        get=AsyncMock(side_effect=[ch, challenger, challengee, challenger, challengee, fset]),
        scalar=AsyncMock(return_value=5),  # sufficient purchased-credit balance
        commit=AsyncMock(),
        refresh=AsyncMock(),
    )
    current_user = SimpleNamespace(id=ch.challengee_id)
    body = {
        "opponent_score": 18,
        "opponent_percentage": 90,
        "opponent_time_seconds": 120,
        "status": "completed",
    }

    result = await patch_challenge(challenge_id=ch.id, current_user=current_user, db=db, body=body)

    assert result["status"] == "completed"
    assert ch.status == QuizChallengeStatus.completed
