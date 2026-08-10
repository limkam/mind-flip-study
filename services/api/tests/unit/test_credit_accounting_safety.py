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
    assert added[0].meta["consumed_from"] == "monthly_allowance"


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
    db.scalar = AsyncMock(side_effect=[None, None, uuid4(), uuid4()])
    added = []
    db.add = added.append
    db.flush = AsyncMock()
    monkeypatch.setattr(credits, "_now", AsyncMock(return_value=datetime(2026, 8, 15, tzinfo=timezone.utc)))

    await credits.award_monthly_allowance_for_user(db, user_id, plan_id)
    await credits.award_monthly_allowance_for_user(db, user_id, plan_id)

    assert len(added) == 1
    assert added[0].idempotency_key == f"monthly:{user_id}:content:2026-08"
