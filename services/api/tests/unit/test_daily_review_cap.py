import pytest
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import routers.study as study


class _ExecResult:
    def __init__(self, value):
        self._value = value

    def scalar_one_or_none(self):
        return self._value


@pytest.mark.asyncio
async def test_apply_daily_review_cap_truncates_for_free_user(monkeypatch):
    user = SimpleNamespace(id=uuid4(), subscription_tier="free")
    db = AsyncMock()

    monkeypatch.setattr(study, "_user_plan_slug", AsyncMock(return_value="free"))
    monkeypatch.setattr(study, "_plan_features", AsyncMock(return_value={"daily_review_limit": 5}))
    monkeypatch.setattr(study, "_reviewed_today_count", AsyncMock(return_value=3))

    effective = await study._apply_daily_review_cap(db, user, requested_limit=20)
    assert effective == 2  # 5 - 3 remaining


@pytest.mark.asyncio
async def test_apply_daily_review_cap_zero_once_limit_reached(monkeypatch):
    user = SimpleNamespace(id=uuid4(), subscription_tier="free")
    db = AsyncMock()

    monkeypatch.setattr(study, "_user_plan_slug", AsyncMock(return_value="free"))
    monkeypatch.setattr(study, "_plan_features", AsyncMock(return_value={"daily_review_limit": 5}))
    monkeypatch.setattr(study, "_reviewed_today_count", AsyncMock(return_value=5))

    effective = await study._apply_daily_review_cap(db, user, requested_limit=20)
    assert effective == 0


@pytest.mark.asyncio
async def test_apply_daily_review_cap_unaffected_for_paid_user(monkeypatch):
    user = SimpleNamespace(id=uuid4(), subscription_tier="premium_30")
    db = AsyncMock()

    monkeypatch.setattr(study, "_user_plan_slug", AsyncMock(return_value="premium_30"))
    monkeypatch.setattr(study, "_plan_features", AsyncMock(return_value={"daily_review_limit": None}))
    reviewed_today = AsyncMock()
    monkeypatch.setattr(study, "_reviewed_today_count", reviewed_today)

    effective = await study._apply_daily_review_cap(db, user, requested_limit=50)
    assert effective == 50
    reviewed_today.assert_not_called()


@pytest.mark.asyncio
async def test_get_due_cards_short_circuits_once_cap_exhausted(monkeypatch):
    user = SimpleNamespace(id=uuid4(), subscription_tier="free", preferences={})
    set_id = uuid4()
    db = AsyncMock()
    db.execute = AsyncMock(return_value=_ExecResult(set_id))

    monkeypatch.setattr(study, "_apply_daily_review_cap", AsyncMock(return_value=0))

    result = await study.get_due_cards(set_id=set_id, current_user=user, db=db, limit=20)
    assert result == []
