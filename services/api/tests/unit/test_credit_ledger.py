import asyncio
import pytest
from unittest.mock import AsyncMock, MagicMock

from fastapi import HTTPException

import services.credits as credits_mod


@pytest.mark.asyncio
async def test_consume_credits_insufficient_raises(monkeypatch):
    # Simulate zero balance
    async def fake_balance(db, user_id, pool="content"):
        return 0

    monkeypatch.setattr(credits_mod, "get_user_balance", fake_balance)

    mock_db = AsyncMock()
    with pytest.raises(HTTPException) as exc:
        await credits_mod.consume_credits(mock_db, user_id="u", amount=1, pool="content", reason="test")
    assert exc.value.status_code == 402


@pytest.mark.asyncio
async def test_consume_burns_monthly_first(monkeypatch):
    # Setup: monthly=3, purchased=10, consume 5 -> expect two negative entries: -3 from monthly, -2 from purchased
    async def fake_split(db, user_id, pool="content"):
        return (3, 10)

    # Simulate get_user_balance returning before/after balances
    seq = [13, 8]

    async def fake_balance(db, user_id, pool="content"):
        return seq.pop(0)

    monkeypatch.setattr(credits_mod, "_split_pool_balances", fake_split)
    monkeypatch.setattr(credits_mod, "get_user_balance", fake_balance)

    added = []

    def fake_add(obj):
        added.append(obj)

    from unittest.mock import MagicMock

    mock_db = MagicMock()
    mock_db.execute = AsyncMock()
    mock_db.add.side_effect = fake_add
    mock_db.flush = AsyncMock()
    mock_db.scalar = AsyncMock(return_value=None)

    new_bal = await credits_mod.consume_credits(mock_db, user_id="u", amount=5, pool="content", reason="regen")
    assert new_bal == 8
    # two entries added
    assert len(added) == 2
    metas = [getattr(o, "meta", {}) for o in added]
    assert metas[0].get("consumed_from") == "plan_credits"
    assert metas[1].get("consumed_from") == "purchased_or_unlocked"
    assert getattr(added[0], "pool") == "content"
    assert getattr(added[1], "pool") == "purchased"


@pytest.mark.asyncio
async def test_consume_regen_burns_monthly_then_shared_purchased(monkeypatch):
    async def fake_split(db, user_id, pool="regen"):
        return (1, 4)

    seq = [5, 3]

    async def fake_balance(db, user_id, pool="regen"):
        return seq.pop(0)

    monkeypatch.setattr(credits_mod, "_split_pool_balances", fake_split)
    monkeypatch.setattr(credits_mod, "get_user_balance", fake_balance)

    added = []

    def fake_add(obj):
        added.append(obj)

    mock_db = MagicMock()
    mock_db.execute = AsyncMock()
    mock_db.add.side_effect = fake_add
    mock_db.flush = AsyncMock()
    mock_db.scalar = AsyncMock(return_value=None)

    new_bal = await credits_mod.consume_credits(mock_db, user_id="u", amount=2, pool="regen", reason="regen")
    assert new_bal == 3
    assert len(added) == 2
    assert getattr(added[0], "pool") == "regen"
    assert getattr(added[1], "pool") == "purchased"
    assert getattr(added[1], "meta", {}).get("consumed_for_pool") == "regen"


@pytest.mark.asyncio
async def test_regen_pool_standard_fails(monkeypatch):
    # Standard users have zero regen balance; ensure regen pool consumption fails regardless of content pool
    async def fake_balance(db, user_id, pool="content"):
        return 0

    monkeypatch.setattr(credits_mod, "get_user_balance", fake_balance)

    mock_db = AsyncMock()
    with pytest.raises(HTTPException) as exc:
        await credits_mod.consume_credits(mock_db, user_id="u", amount=1, pool="regen", reason="regen")
    assert exc.value.status_code == 402
