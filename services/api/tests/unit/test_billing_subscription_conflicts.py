from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from fastapi import HTTPException

import routers.billing as billing


def _db_with_local(rows):
    db = AsyncMock()
    result = MagicMock()
    result.scalars.return_value.all.return_value = rows
    db.execute = AsyncMock(return_value=result)
    return db


@pytest.mark.asyncio
async def test_multiple_local_active_subscription_ids_return_conflict(monkeypatch):
    user = SimpleNamespace(id=uuid4(), stripe_customer_id="cus_1")
    db = _db_with_local([
        SimpleNamespace(stripe_subscription_id="sub_1"),
        SimpleNamespace(stripe_subscription_id="sub_2"),
    ])
    list_mock = MagicMock()
    monkeypatch.setattr(billing.stripe.Subscription, "list", list_mock)

    result = await billing._resolve_stripe_subscription(db, user)

    assert result == {"state": "subscription_conflict", "subscription": None, "count": 2}
    list_mock.assert_not_called()


@pytest.mark.asyncio
async def test_one_local_subscription_id_does_not_hide_multiple_stripe_rows(monkeypatch):
    user = SimpleNamespace(id=uuid4(), stripe_customer_id="cus_1")
    db = _db_with_local([SimpleNamespace(stripe_subscription_id="sub_local")])
    monkeypatch.setattr(billing.settings, "STRIPE_SECRET_KEY", "sk_test")
    stripe_result = SimpleNamespace(data=[
        {"id": "sub_other", "status": "active"},
        {"id": "sub_local", "status": "active"},
    ])
    monkeypatch.setattr(billing.asyncio, "to_thread", AsyncMock(return_value=stripe_result))

    result = await billing._resolve_stripe_subscription(db, user)

    assert result["state"] == "subscription_conflict"
    assert result["subscription"] is None
    assert result["count"] == 2


@pytest.mark.asyncio
async def test_multiple_stripe_subscriptions_without_local_reference_return_conflict(monkeypatch):
    user = SimpleNamespace(id=uuid4(), stripe_customer_id="cus_1")
    db = _db_with_local([])
    monkeypatch.setattr(billing.settings, "STRIPE_SECRET_KEY", "sk_test")
    stripe_result = SimpleNamespace(data=[
        {"id": "sub_1", "status": "active"}, {"id": "sub_2", "status": "trialing"},
    ])
    monkeypatch.setattr(billing.asyncio, "to_thread", AsyncMock(return_value=stripe_result))

    result = await billing._resolve_stripe_subscription(db, user)

    assert result["state"] == "subscription_conflict"
    assert result["count"] == 2


@pytest.mark.asyncio
async def test_checkout_is_blocked_when_subscription_already_active(monkeypatch):
    user = SimpleNamespace(id=uuid4(), email="person@example.com", stripe_customer_id="cus_1")
    db = AsyncMock()
    row_result = MagicMock()
    row_result.scalar_one.return_value = user
    db.execute = AsyncMock(return_value=row_result)
    monkeypatch.setattr(billing.settings, "STRIPE_SECRET_KEY", "sk_test")
    monkeypatch.setattr(billing.settings, "STRIPE_PRICE_ID_QUICK_MONTHLY", "price_quick")
    monkeypatch.setattr(billing, "_resolve_stripe_subscription", AsyncMock(return_value={"state": "active", "subscription": {"id": "sub_1"}, "count": 1}))
    create_mock = MagicMock()
    monkeypatch.setattr(billing.stripe.checkout.Session, "create", create_mock)

    with pytest.raises(HTTPException) as error:
        await billing.create_checkout_session(current_user=user, db=db, plan=billing.BillingPlan.quick, interval=billing.BillingInterval.monthly)

    assert error.value.status_code == 409
    assert error.value.detail["code"] == "ALREADY_SUBSCRIBED"
    create_mock.assert_not_called()


@pytest.mark.asyncio
async def test_cancellation_is_blocked_for_subscription_conflict(monkeypatch):
    user = SimpleNamespace(id=uuid4())
    db = AsyncMock()
    monkeypatch.setattr(
        billing,
        "_resolve_stripe_subscription",
        AsyncMock(return_value={"state": "subscription_conflict", "subscription": None, "count": 2}),
    )
    modify_mock = MagicMock()
    monkeypatch.setattr(billing.stripe.Subscription, "modify", modify_mock)

    with pytest.raises(HTTPException) as error:
        await billing.cancel_subscription_at_period_end(current_user=user, db=db)

    assert error.value.status_code == 409
    assert error.value.detail["code"] == "SUBSCRIPTION_CONFLICT"
    modify_mock.assert_not_called()


@pytest.mark.asyncio
async def test_cancellation_stripe_failure_does_not_mutate_local_state(monkeypatch):
    user = SimpleNamespace(id=uuid4())
    local_sub = SimpleNamespace(stripe_subscription_id="sub_1", status="active", current_period_end=None)
    db = AsyncMock()
    db.scalar = AsyncMock(return_value=local_sub)
    monkeypatch.setattr(billing.settings, "STRIPE_SECRET_KEY", "sk_test")
    monkeypatch.setattr(
        billing,
        "_resolve_stripe_subscription",
        AsyncMock(return_value={"state": "active", "subscription": {"id": "sub_1"}, "count": 1}),
    )
    monkeypatch.setattr(billing.asyncio, "to_thread", AsyncMock(side_effect=TimeoutError))

    with pytest.raises(HTTPException) as error:
        await billing.cancel_subscription_at_period_end(current_user=user, db=db)

    assert error.value.status_code == 503
    assert error.value.detail["code"] == "CANCELLATION_UNAVAILABLE"
    assert local_sub.status == "active"
    db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_repeated_checkout_requests_share_idempotency_key(monkeypatch):
    user = SimpleNamespace(id=uuid4(), email="person@example.com", stripe_customer_id="cus_1")
    db = AsyncMock()
    row_result = MagicMock()
    row_result.scalar_one.return_value = user
    db.execute = AsyncMock(return_value=row_result)
    monkeypatch.setattr(billing.settings, "STRIPE_SECRET_KEY", "sk_test")
    monkeypatch.setattr(billing.settings, "STRIPE_PRICE_ID_QUICK_MONTHLY", "price_quick")
    monkeypatch.setattr(
        billing,
        "_resolve_stripe_subscription",
        AsyncMock(return_value={"state": "none", "subscription": None, "count": 0}),
    )
    keys = []

    def create_session(**kwargs):
        keys.append(kwargs["idempotency_key"])
        return SimpleNamespace(url="https://checkout.stripe.test/session")

    monkeypatch.setattr(billing.stripe.checkout.Session, "create", create_session)

    await billing.create_checkout_session(current_user=user, db=db, plan=billing.BillingPlan.quick, interval=billing.BillingInterval.monthly)
    await billing.create_checkout_session(current_user=user, db=db, plan=billing.BillingPlan.quick, interval=billing.BillingInterval.monthly)

    assert len(keys) == 2
    assert keys[0] == keys[1]
