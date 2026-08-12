from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException

from ai_credits import ai_credits_snapshot
from config import settings
from dependencies import enforce_tier_limit
from models.plan import Plan
from models.user_subscription import UserSubscription


STATES = (
    ("active", True, True),
    ("trialing", True, True),
    ("past_due", True, True),
    ("past_due", False, False),
    ("canceled", True, True),
    ("canceled", False, False),
    ("paused", True, False),
    ("incomplete", True, False),
    ("incomplete_expired", True, False),
    ("unpaid", True, False),
    (None, False, False),
)


def _objects(status, future):
    user_id = uuid4()
    user = type("User", (), {"id": user_id, "subscription_tier": "premium"})()
    plan = Plan(id=uuid4(), slug="premium_30", name="Premium")
    if status is None:
        return user, plan, None
    end = datetime.now(timezone.utc) + (timedelta(days=1) if future else -timedelta(days=1))
    sub = UserSubscription(user_id=user_id, plan_id=plan.id, status=status, current_period_end=end)
    return user, plan, sub


@pytest.mark.asyncio
@pytest.mark.parametrize("status,future,paid", STATES)
async def test_resource_limits_use_canonical_subscription(status, future, paid):
    user, plan, sub = _objects(status, future)
    db = AsyncMock()
    db.scalar = AsyncMock(side_effect=[sub] if paid else [sub, 1])
    db.get = AsyncMock(return_value=plan)
    check = enforce_tier_limit("books")

    with patch.object(settings, "FREE_TIER_PAYWALL_ENABLED", True), patch(
        "dependencies.consumed_quantity", AsyncMock(return_value=1)
    ):
        if paid:
            await check(user, db)
        else:
            with pytest.raises(HTTPException) as exc:
                await check(user, db)
            assert exc.value.status_code == 403


@pytest.mark.asyncio
@pytest.mark.parametrize("status,future,paid", STATES)
async def test_ai_credit_limits_use_canonical_subscription(status, future, paid):
    user, plan, sub = _objects(status, future)
    db = AsyncMock()
    db.scalar = AsyncMock(side_effect=[sub, 0])
    db.get = AsyncMock(return_value=plan)

    snapshot = await ai_credits_snapshot(db, user)

    expected = settings.AI_CREDITS_STUDENT_MONTHLY if paid else settings.AI_CREDITS_FREE_MONTHLY
    assert snapshot["limit"] == expected
