import pytest
from unittest.mock import AsyncMock
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from services.entitlements import can_user_do, Action, _user_plan_slug
from models.user_subscription import UserSubscription


class _User:
    def __init__(self, id, subscription_tier):
        self.id = id
        self.subscription_tier = subscription_tier


@pytest.mark.asyncio
async def test_standard_regen_requires_purchase(monkeypatch):
    user = _User("u1", "standard_15")
    fake_db = AsyncMock()

    async def fake_split(db, user_id, pool="regen"):
        return (0, 0)  # monthly=0, purchased=0

    monkeypatch.setattr("services.credits._split_pool_balances", fake_split)

    ent = await can_user_do(fake_db, user, Action.REGENERATE)
    assert ent["allowed"] is False
    assert ent["upgrade_hook"]["free_on_premium_30"] is True


@pytest.mark.asyncio
async def test_premium_regen_uses_monthly_first(monkeypatch):
    user = _User(uuid4(), "premium_30")
    fake_db = AsyncMock()
    plan_id = uuid4()
    fake_db.scalar = AsyncMock(return_value=UserSubscription(
        user_id=user.id,
        plan_id=plan_id,
        status="active",
        current_period_end=datetime.now(timezone.utc) + timedelta(days=1),
    ))
    from models.plan import Plan
    fake_db.get = AsyncMock(return_value=Plan(id=plan_id, slug="premium_30", name="Premium"))

    async def fake_split(db, user_id, pool="regen"):
        return (1, 0)

    monkeypatch.setattr("services.credits._split_pool_balances", fake_split)

    ent = await can_user_do(fake_db, user, Action.REGENERATE)
    assert ent["allowed"] is True
    assert ent["reason"] == "monthly_regen"
    assert ent["consume"]["from"] == "monthly"


@pytest.mark.asyncio
async def test_free_user_can_not_regen_without_purchase(monkeypatch):
    user = _User("u3", "free")
    fake_db = AsyncMock()

    async def fake_split(db, user_id, pool="regen"):
        return (0, 0)

    monkeypatch.setattr("services.credits._split_pool_balances", fake_split)

    ent = await can_user_do(fake_db, user, Action.REGENERATE)
    assert ent["allowed"] is False
    assert ent["upgrade_hook"]["free_on_premium_30"] is True


@pytest.mark.asyncio
async def test_expired_subscription_does_not_fall_back_to_stale_paid_tier():
    user_id = uuid4()
    user = _User(user_id, "premium")
    fake_db = AsyncMock()
    expired = UserSubscription(
        user_id=user_id,
        plan_id=uuid4(),
        status="canceled",
        current_period_end=datetime.now(timezone.utc) - timedelta(days=1),
    )
    fake_db.scalar = AsyncMock(return_value=expired)

    plan_slug = await _user_plan_slug(fake_db, user)

    assert plan_slug == "free"
