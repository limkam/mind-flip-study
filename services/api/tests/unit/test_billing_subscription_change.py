from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

import routers.billing as billing
from models.plan import Plan
from models.user_subscription import UserSubscription


def test_rank_amount_cents_orders_plans_by_price(monkeypatch):
    monkeypatch.setattr(billing.settings, "BILLING_PRICE_CENTS_QUICK_MONTHLY", 399)
    monkeypatch.setattr(billing.settings, "BILLING_PRICE_CENTS_QUICK_ANNUAL", 2400)
    monkeypatch.setattr(billing.settings, "BILLING_PRICE_CENTS_STANDARD_MONTHLY", 699)
    monkeypatch.setattr(billing.settings, "BILLING_PRICE_CENTS_STANDARD_ANNUAL", 4200)
    monkeypatch.setattr(billing.settings, "BILLING_PRICE_CENTS_PREMIUM_MONTHLY", 899)
    monkeypatch.setattr(billing.settings, "BILLING_PRICE_CENTS_PREMIUM_ANNUAL", 5400)

    premium = billing._rank_amount_cents("premium_30", billing.BillingInterval.monthly)
    standard = billing._rank_amount_cents("standard_15", billing.BillingInterval.monthly)
    quick = billing._rank_amount_cents("quick_72", billing.BillingInterval.monthly)
    free = billing._rank_amount_cents("free", billing.BillingInterval.monthly)

    assert premium > standard > quick > free == 0


@pytest.mark.asyncio
async def test_sync_clears_pending_change_when_scheduled_price_lands(monkeypatch):
    """Once a scheduled downgrade's second phase activates, Stripe fires an ordinary
    customer.subscription.updated event for the item price the schedule set — the sync
    function must recognize that and clear the pending_* bookkeeping columns."""
    monkeypatch.setattr(billing.settings, "STRIPE_PRICE_ID_STANDARD_MONTHLY", "price_std_month")
    monkeypatch.setattr(billing.settings, "STRIPE_PRICE_ID_STANDARD_ANNUAL", "")
    monkeypatch.setattr(billing.settings, "STRIPE_PRICE_ID_BASIC", "")
    monkeypatch.setattr(billing.settings, "STRIPE_PRICE_ID", "")

    user_id = uuid4()
    plan_id = uuid4()
    stripe_sub_id = "sub_123"

    user = SimpleNamespace(id=user_id, stripe_customer_id="cus_1", subscription_tier="premium")
    plan = Plan(id=plan_id, slug="standard_15", name="Standard 15")
    internal_sub = UserSubscription(
        user_id=user_id,
        plan_id=uuid4(),
        stripe_subscription_id=stripe_sub_id,
        status="active",
        pending_plan_id=plan_id,
        pending_price_id="price_std_month",
        pending_change_effective_at=datetime.now(timezone.utc),
        stripe_schedule_id="sub_sched_1",
    )

    db = AsyncMock()
    db.scalar = AsyncMock(side_effect=[user, plan, internal_sub])
    db.add = lambda *_args, **_kwargs: None
    monkeypatch.setattr(billing.credits_service, "award_monthly_allowance_for_user", AsyncMock())

    sub_payload = {
        "id": stripe_sub_id,
        "customer": "cus_1",
        "status": "active",
        "items": {"data": [{"price": {"id": "price_std_month", "unit_amount": 699, "recurring": {"interval_count": 1}}}]},
    }

    result = await billing._sync_subscription_from_stripe_object(db, sub_payload)

    assert result is True
    assert internal_sub.pending_plan_id is None
    assert internal_sub.pending_price_id is None
    assert internal_sub.pending_change_effective_at is None
    assert internal_sub.stripe_schedule_id is None


@pytest.mark.asyncio
async def test_sync_leaves_pending_change_untouched_when_price_does_not_match(monkeypatch):
    """Before the scheduled swap lands, an unrelated subscription.updated event (still on
    the old price) must not clear the pending downgrade bookkeeping."""
    monkeypatch.setattr(billing.settings, "STRIPE_PRICE_ID_PREMIUM", "price_premium")
    monkeypatch.setattr(billing.settings, "STRIPE_PRICE_ID_PREMIUM_MONTHLY", "")
    monkeypatch.setattr(billing.settings, "STRIPE_PRICE_ID_PREMIUM_ANNUAL", "")

    user_id = uuid4()
    plan_id = uuid4()
    stripe_sub_id = "sub_456"

    user = SimpleNamespace(id=user_id, stripe_customer_id="cus_2", subscription_tier="premium")
    plan = Plan(id=plan_id, slug="premium_30", name="Premium 30")
    internal_sub = UserSubscription(
        user_id=user_id,
        plan_id=plan_id,
        stripe_subscription_id=stripe_sub_id,
        status="active",
        pending_plan_id=uuid4(),
        pending_price_id="price_std_month",
        pending_change_effective_at=datetime.now(timezone.utc),
        stripe_schedule_id="sub_sched_2",
    )

    db = AsyncMock()
    db.scalar = AsyncMock(side_effect=[user, plan, internal_sub])
    db.add = lambda *_args, **_kwargs: None
    monkeypatch.setattr(billing.credits_service, "award_monthly_allowance_for_user", AsyncMock())

    sub_payload = {
        "id": stripe_sub_id,
        "customer": "cus_2",
        "status": "active",
        "items": {"data": [{"price": {"id": "price_premium", "unit_amount": 899, "recurring": {"interval_count": 1}}}]},
    }

    await billing._sync_subscription_from_stripe_object(db, sub_payload)

    assert internal_sub.pending_price_id == "price_std_month"
    assert internal_sub.stripe_schedule_id == "sub_sched_2"
