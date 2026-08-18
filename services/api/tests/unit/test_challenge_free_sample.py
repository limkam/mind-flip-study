from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from routers.quiz_challenges import FREE_MONTHLY_CHALLENGE_COMPLETIONS, _challenge_completion_eligibility


@pytest.mark.asyncio
async def test_free_plan_recipient_allowed_under_monthly_cap(monkeypatch):
    monkeypatch.setattr("routers.quiz_challenges.can_user_do", AsyncMock(return_value={"allowed": False}))
    db = SimpleNamespace(scalar=AsyncMock(return_value=FREE_MONTHLY_CHALLENGE_COMPLETIONS - 1))
    user = SimpleNamespace(id=uuid4())

    result = await _challenge_completion_eligibility(db, user)

    assert result == {"allowed": True, "free_sample": True}


@pytest.mark.asyncio
async def test_free_plan_recipient_blocked_at_monthly_cap(monkeypatch):
    monkeypatch.setattr("routers.quiz_challenges.can_user_do", AsyncMock(return_value={"allowed": False}))
    db = SimpleNamespace(scalar=AsyncMock(return_value=FREE_MONTHLY_CHALLENGE_COMPLETIONS))
    user = SimpleNamespace(id=uuid4())

    result = await _challenge_completion_eligibility(db, user)

    assert result["allowed"] is False
    assert result["code"] == "CHALLENGE_SAMPLE_LIMIT_REACHED"


@pytest.mark.asyncio
async def test_paying_plan_recipient_gets_normal_access_not_sample_cap(monkeypatch):
    """A recipient whose own plan already grants can_send_challenges must not be routed
    through the free-sample cap at all — no matter how many challenges they've completed."""
    monkeypatch.setattr("routers.quiz_challenges.can_user_do", AsyncMock(return_value={"allowed": True}))
    monkeypatch.setattr("routers.quiz_challenges.get_user_balance", AsyncMock(return_value=3))
    db = SimpleNamespace(scalar=AsyncMock(side_effect=AssertionError("must not touch the monthly sample-count query")))
    user = SimpleNamespace(id=uuid4())

    result = await _challenge_completion_eligibility(db, user)

    assert result == {"allowed": True, "free_sample": False}


@pytest.mark.asyncio
async def test_paying_plan_recipient_without_credits_is_blocked(monkeypatch):
    monkeypatch.setattr("routers.quiz_challenges.can_user_do", AsyncMock(return_value={"allowed": True}))
    monkeypatch.setattr("routers.quiz_challenges.get_user_balance", AsyncMock(return_value=0))
    db = SimpleNamespace()
    user = SimpleNamespace(id=uuid4())

    result = await _challenge_completion_eligibility(db, user)

    assert result["allowed"] is False
    assert result["code"] == "INSUFFICIENT_CREDITS"
