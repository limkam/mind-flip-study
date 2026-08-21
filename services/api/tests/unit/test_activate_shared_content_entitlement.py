from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from models.plan import Plan
from models.user_subscription import UserSubscription
from services.entitlements import Action, can_user_do


class _User:
    def __init__(self, id):
        self.id = id


def _db_with_plan(plan_slug: str) -> AsyncMock:
    """Mocks the two real db.scalar calls in can_user_do's ACTIVATE_SHARED_CONTENT path:
    _user_plan_slug's UserSubscription lookup, then _plan_features' Plan lookup (returns
    None so DEFAULT_PLAN_FEATURES applies)."""
    plan_id = uuid4()
    sub = UserSubscription(
        user_id=uuid4(),
        plan_id=plan_id,
        status="active",
        current_period_end=datetime.now(timezone.utc) + timedelta(days=1),
    )
    db = AsyncMock()
    db.scalar = AsyncMock(side_effect=[sub, None])
    db.get = AsyncMock(return_value=Plan(id=plan_id, slug=plan_slug, name=plan_slug))
    return db


@pytest.mark.asyncio
async def test_activate_shared_content_allowed_with_enough_content_credits(monkeypatch):
    # Activation costs 2 content credits (1 book-equivalent + 1 set-equivalent).
    monkeypatch.setattr("services.entitlements.credits.get_user_balance", AsyncMock(return_value=3))
    db = _db_with_plan("standard_15")

    decision = await can_user_do(db, _User(uuid4()), Action.ACTIVATE_SHARED_CONTENT)

    assert decision["allowed"] is True
    assert decision["consume"] == {"pool": "content", "amount": 2}


@pytest.mark.asyncio
async def test_activate_shared_content_blocked_when_credits_exhausted(monkeypatch):
    monkeypatch.setattr("services.entitlements.credits.get_user_balance", AsyncMock(return_value=1))
    db = _db_with_plan("standard_15")

    decision = await can_user_do(db, _User(uuid4()), Action.ACTIVATE_SHARED_CONTENT)

    assert decision["allowed"] is False
    assert decision["reason"] == "content_credits_exhausted"


@pytest.mark.asyncio
async def test_activate_shared_content_does_not_write_usage_events(monkeypatch):
    """The entitlement check itself must never call record_usage / touch the ledger —
    only the caller does that on success."""
    record_usage = AsyncMock()
    monkeypatch.setattr("services.entitlements.credits.get_user_balance", AsyncMock(return_value=5))
    monkeypatch.setattr("services.usage_events.record_usage", record_usage)
    db = _db_with_plan("free")

    decision = await can_user_do(db, _User(uuid4()), Action.ACTIVATE_SHARED_CONTENT)

    assert decision["allowed"] is True
    record_usage.assert_not_awaited()
