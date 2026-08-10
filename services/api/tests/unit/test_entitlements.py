import pytest
from unittest.mock import AsyncMock

from services.entitlements import can_user_do, Action


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
    user = _User("u2", "premium_30")
    fake_db = AsyncMock()

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
