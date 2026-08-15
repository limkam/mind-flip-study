from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from routers.quiz_challenges import _require_challenge_access


@pytest.mark.asyncio
async def test_quick_7_can_access_challenges(monkeypatch):
    monkeypatch.setattr("routers.quiz_challenges.can_user_do", AsyncMock(return_value={"allowed": True}))
    await _require_challenge_access(AsyncMock(), SimpleNamespace(id="quick-user"))


@pytest.mark.asyncio
async def test_unauthorized_plan_cannot_access_challenges(monkeypatch):
    monkeypatch.setattr("routers.quiz_challenges.can_user_do", AsyncMock(return_value={"allowed": False}))
    with pytest.raises(HTTPException) as exc:
        await _require_challenge_access(AsyncMock(), SimpleNamespace(id="free-user"))
    assert exc.value.status_code == 402
