from datetime import datetime, timezone
from unittest.mock import AsyncMock
from types import SimpleNamespace
from uuid import uuid4

import pytest

from services import credits


@pytest.mark.asyncio
async def test_monthly_consumption_inherits_grant_expiration(monkeypatch):
    user_id = uuid4()
    expiry = datetime(2026, 9, 1, tzinfo=timezone.utc)
    db = AsyncMock()
    db.scalar = AsyncMock(side_effect=[7, 7, 0, expiry, 6])
    added = []
    db.add = added.append
    db.flush = AsyncMock()

    balance = await credits.consume_credits(db, user_id, 1, pool="content", reason="create_book")

    assert balance == 6
    assert len(added) == 1
    assert added[0].amount == -1
    assert added[0].expires_at == expiry
    assert added[0].meta["consumed_from"] == "plan_credits"


@pytest.mark.asyncio
async def test_balance_is_clamped_at_zero():
    db = AsyncMock()
    db.scalar = AsyncMock(return_value=-4)

    assert await credits.get_user_balance(db, uuid4(), pool="content") == 0


@pytest.mark.asyncio
async def test_monthly_grant_is_idempotent_for_same_user_and_period(monkeypatch):
    user_id = uuid4()
    plan_id = uuid4()
    db = AsyncMock()
    db.get = AsyncMock(return_value=SimpleNamespace(
        slug="quick_72", monthly_content_allowance=7, monthly_regen_allowance=0,
    ))
    monkeypatch.setattr(credits, "_active_subscription_period_end", AsyncMock(return_value=None))
    monkeypatch.setattr(credits, "_now", AsyncMock(return_value=datetime(2026, 8, 15, tzinfo=timezone.utc)))
    # 1st call: nothing granted yet this period (sum=0) -> shortfall=7, no existing grant row -> grants once.
    # 2nd call: 7 already granted this period (sum=7) -> shortfall=0 -> returns before re-granting.
    db.scalar = AsyncMock(side_effect=[0, None, 7])
    added = []
    db.add = added.append
    db.flush = AsyncMock()

    await credits.award_monthly_allowance_for_user(db, user_id, plan_id)
    await credits.award_monthly_allowance_for_user(db, user_id, plan_id)

    assert len(added) == 1
    assert added[0].amount == 7
    assert added[0].idempotency_key == f"monthly:{user_id}:content:2026-08:7"


@pytest.mark.asyncio
async def test_monthly_grant_tops_up_on_mid_cycle_upgrade(monkeypatch):
    """Upgrading mid-cycle must top up the same period's grant to the new, higher plan
    allowance instead of being skipped by an idempotency key that only knows about the
    smaller amount already granted at the start of the period."""
    user_id = uuid4()
    old_plan_id = uuid4()
    new_plan_id = uuid4()
    db = AsyncMock()
    db.get = AsyncMock(side_effect=[
        SimpleNamespace(slug="quick_72", monthly_content_allowance=7, monthly_regen_allowance=0),
        SimpleNamespace(slug="standard_15", monthly_content_allowance=15, monthly_regen_allowance=0),
    ])
    monkeypatch.setattr(credits, "_active_subscription_period_end", AsyncMock(return_value=None))
    monkeypatch.setattr(credits, "_now", AsyncMock(return_value=datetime(2026, 8, 15, tzinfo=timezone.utc)))
    # 1st call (quick_72, target=7): sum=0 -> shortfall=7 -> grants 7, no existing idempotency row.
    # 2nd call (standard_15, target=15): sum=7 (the earlier grant) -> shortfall=8 -> tops up by 8.
    db.scalar = AsyncMock(side_effect=[0, None, 7, None])
    added = []
    db.add = added.append
    db.flush = AsyncMock()

    await credits.award_monthly_allowance_for_user(db, user_id, old_plan_id)
    await credits.award_monthly_allowance_for_user(db, user_id, new_plan_id)

    assert len(added) == 2
    assert added[0].amount == 7
    assert added[1].amount == 8
    assert added[1].idempotency_key == f"monthly:{user_id}:content:2026-08:15"
