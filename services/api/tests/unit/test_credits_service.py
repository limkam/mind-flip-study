"""Unit tests for credit service functions."""

import pytest
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4
from datetime import datetime, timezone, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from services.credits import award_onetime_credits_for_user
import services.credits as credits_mod
from models.credit_ledger import CreditLedger


@pytest.mark.asyncio
async def test_award_onetime_credits():
    """Test awarding one-time purchased credits."""
    mock_db = AsyncMock(spec=AsyncSession)
    mock_db.scalar = AsyncMock(return_value=datetime.now(timezone.utc) + timedelta(days=30))
    user_id = uuid4()
    amount = 100
    
    await award_onetime_credits_for_user(mock_db, user_id, amount)
    
    # Verify a CreditLedger entry was added
    assert mock_db.add.called
    call_args = mock_db.add.call_args
    entry = call_args[0][0]
    
    assert isinstance(entry, CreditLedger)
    assert entry.user_id == user_id
    assert entry.amount == amount
    assert entry.pool == "purchased"
    assert entry.reason == "purchased_credits"
    assert entry.expires_at is None
    assert entry.meta.get("purchase_type") == "stripe_checkout"


@pytest.mark.asyncio
async def test_award_onetime_credits_links_ledger_to_checkout_session():
    mock_db = AsyncMock(spec=AsyncSession)
    user_id = uuid4()

    await award_onetime_credits_for_user(mock_db, user_id, 3, stripe_session_id="cs_paid_123")

    entry = mock_db.add.call_args.args[0]
    assert entry.idempotency_key == "stripe_checkout:cs_paid_123:credits"
    assert entry.meta["stripe_session_id"] == "cs_paid_123"


@pytest.mark.asyncio
async def test_award_onetime_credits_fallback_non_expiring_when_no_subscription_period():
    mock_db = AsyncMock(spec=AsyncSession)
    mock_db.scalar = AsyncMock(return_value=None)
    user_id = uuid4()

    await award_onetime_credits_for_user(mock_db, user_id, 2)

    call_args = mock_db.add.call_args
    entry = call_args[0][0]
    assert entry.expires_at is None


@pytest.mark.asyncio
async def test_award_onetime_credits_zero_amount():
    """Test that zero amount is skipped."""
    mock_db = AsyncMock(spec=AsyncSession)
    user_id = uuid4()
    
    await award_onetime_credits_for_user(mock_db, user_id, 0)
    
    # Verify nothing was added
    assert not mock_db.add.called


@pytest.mark.asyncio
async def test_award_onetime_credits_negative_amount():
    """Test that negative amount is skipped."""
    mock_db = AsyncMock(spec=AsyncSession)
    user_id = uuid4()
    
    await award_onetime_credits_for_user(mock_db, user_id, -50)
    
    # Verify nothing was added
    assert not mock_db.add.called


@pytest.mark.asyncio
async def test_award_onetime_credits_large_amount():
    """Test awarding large credit amounts."""
    mock_db = AsyncMock(spec=AsyncSession)
    user_id = uuid4()
    amount = 5000
    
    await award_onetime_credits_for_user(mock_db, user_id, amount)
    
    # Verify the entry was added with correct amount
    call_args = mock_db.add.call_args
    entry = call_args[0][0]
    assert entry.amount == 5000


@pytest.mark.asyncio
async def test_get_user_balance_filters_expired_purchased_entries():
    captured = {}

    class _Db:
        async def scalar(self, stmt):
            captured["stmt"] = str(stmt)
            return 0

    await credits_mod.get_user_balance(_Db(), uuid4(), pool="purchased")
    assert "credit_ledger.expires_at" in captured["stmt"]


def test_period_end_for_next_cycle_rollover():
    jan = datetime(2026, 1, 15, tzinfo=timezone.utc)
    dec = datetime(2026, 12, 15, tzinfo=timezone.utc)
    jan_end = credits_mod._period_end_for_next_cycle(jan)
    dec_end = credits_mod._period_end_for_next_cycle(dec)
    assert jan_end.year == 2026 and jan_end.month == 2 and jan_end.day == 1
    assert dec_end.year == 2027 and dec_end.month == 1 and dec_end.day == 1


@pytest.mark.asyncio
async def test_consume_extra_credits_success():
    mock_db = AsyncMock(spec=AsyncSession)
    user_id = uuid4()
    # Mock get_user_balance to return 5 extra credits initially, then 4 after consumption
    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(credits_mod, "get_user_balance", AsyncMock(side_effect=[5, 4]))
        new_bal = await credits_mod.consume_extra_credits(
            mock_db, user_id, 1, reason="Accessed Study Group Flashcards"
        )
        assert new_bal == 4
        assert mock_db.add.called
        entry = mock_db.add.call_args[0][0]
        assert entry.amount == -1
        assert entry.pool == "purchased"
        assert entry.reason == "Accessed Study Group Flashcards"
        assert entry.expires_at is None


@pytest.mark.asyncio
async def test_consume_extra_credits_insufficient_throws_402():
    mock_db = AsyncMock(spec=AsyncSession)
    user_id = uuid4()
    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(credits_mod, "get_user_balance", AsyncMock(return_value=0))
        with pytest.raises(credits_mod.HTTPException) as exc_info:
            await credits_mod.consume_extra_credits(
                mock_db, user_id, 1, reason="Accepted Challenge"
            )
        assert exc_info.value.status_code == 402
        assert exc_info.value.detail["code"] == "INSUFFICIENT_CREDITS"
