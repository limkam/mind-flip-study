from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi import HTTPException

from dependencies import enforce_challenge_send_rate_limit


@pytest.mark.asyncio
async def test_challenge_send_rate_limit_allows_under_cap(monkeypatch):
    monkeypatch.setattr("dependencies.settings.CHALLENGE_SEND_RATE_LIMIT_MAX_PER_DAY", 20)
    enforce = enforce_challenge_send_rate_limit()
    redis = SimpleNamespace(incr=AsyncMock(return_value=5), expire=AsyncMock())
    user = SimpleNamespace(id=uuid4())

    await enforce(current_user=user, redis=redis)

    redis.expire.assert_not_awaited()


@pytest.mark.asyncio
async def test_challenge_send_rate_limit_blocks_over_cap(monkeypatch):
    monkeypatch.setattr("dependencies.settings.CHALLENGE_SEND_RATE_LIMIT_MAX_PER_DAY", 20)
    enforce = enforce_challenge_send_rate_limit()
    redis = SimpleNamespace(incr=AsyncMock(return_value=21), expire=AsyncMock())
    user = SimpleNamespace(id=uuid4())

    with pytest.raises(HTTPException) as exc:
        await enforce(current_user=user, redis=redis)

    assert exc.value.status_code == 429
    assert exc.value.detail["code"] == "CHALLENGE_SEND_LIMIT_REACHED"


@pytest.mark.asyncio
async def test_challenge_send_rate_limit_sets_expiry_on_first_request(monkeypatch):
    monkeypatch.setattr("dependencies.settings.CHALLENGE_SEND_RATE_LIMIT_MAX_PER_DAY", 20)
    enforce = enforce_challenge_send_rate_limit()
    redis = SimpleNamespace(incr=AsyncMock(return_value=1), expire=AsyncMock())
    user = SimpleNamespace(id=uuid4())

    await enforce(current_user=user, redis=redis)

    redis.expire.assert_awaited_once_with(f"challenge-send:rl:{user.id}", 86400)


@pytest.mark.asyncio
async def test_challenge_send_rate_limit_disabled_when_zero(monkeypatch):
    monkeypatch.setattr("dependencies.settings.CHALLENGE_SEND_RATE_LIMIT_MAX_PER_DAY", 0)
    enforce = enforce_challenge_send_rate_limit()
    redis = SimpleNamespace(incr=AsyncMock(side_effect=AssertionError("should not touch redis when disabled")))
    user = SimpleNamespace(id=uuid4())

    await enforce(current_user=user, redis=redis)
