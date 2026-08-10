from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4
import types
import sys

import pytest

import routers.billing as billing


class _Req:
    def __init__(self):
        self.headers = {"stripe-signature": "sig"}

    async def body(self):
        return b"{}"


class _ExecResult:
    def __init__(self, user=None):
        self._user = user

    def scalar_one_or_none(self):
        return self._user


@pytest.mark.asyncio
async def test_webhook_unpaid_payment_does_not_award_credits(monkeypatch):
    user = SimpleNamespace(id=uuid4(), email="u@example.com", full_name="User", stripe_customer_id=None)
    db = AsyncMock()
    db.add = lambda *_args, **_kwargs: None

    async def fake_execute(stmt):
        return _ExecResult(user)

    db.execute = fake_execute
    db.scalar = AsyncMock(side_effect=[None])  # existing purchase lookup
    db.commit = AsyncMock()
    redis = AsyncMock()
    redis.set = AsyncMock(return_value=True)

    monkeypatch.setattr(billing.settings, "STRIPE_WEBHOOK_SECRET", "whsec_test")
    monkeypatch.setattr(
        billing.stripe.Webhook,
        "construct_event",
        lambda payload, sig, secret: {
            "id": "evt_test_unpaid",
            "type": "checkout.session.completed",
            "data": {
                "object": {
                    "id": "cs_test_unpaid",
                    "mode": "payment",
                    "payment_status": "unpaid",
                    "customer": "cus_1",
                    "metadata": {
                        "user_id": str(user.id),
                        "credit_quantity": "3",
                        "unit_price_cents": "80",
                        "currency": "usd",
                    },
                    "amount_total": 240,
                    "currency": "usd",
                    "payment_intent": "pi_unpaid",
                }
            },
        },
    )

    award_mock = AsyncMock()
    monkeypatch.setattr(billing.credits_service, "award_onetime_credits_for_user", award_mock)

    out = await billing.stripe_webhook(_Req(), db=db, redis=redis)
    assert out == {"received": True}
    award_mock.assert_not_called()


@pytest.mark.asyncio
async def test_webhook_duplicate_event_short_circuits(monkeypatch):
    db = AsyncMock()
    redis = AsyncMock()
    redis.set = AsyncMock(return_value=False)  # duplicate event key already exists

    monkeypatch.setattr(billing.settings, "STRIPE_WEBHOOK_SECRET", "whsec_test")
    monkeypatch.setattr(
        billing.stripe.Webhook,
        "construct_event",
        lambda payload, sig, secret: {"id": "evt_dup", "type": "checkout.session.completed", "data": {"object": {"mode": "payment"}}},
    )

    award_mock = AsyncMock()
    monkeypatch.setattr(billing.credits_service, "award_onetime_credits_for_user", award_mock)

    out = await billing.stripe_webhook(_Req(), db=db, redis=redis)
    assert out == {"received": True}
    award_mock.assert_not_called()


@pytest.mark.asyncio
async def test_webhook_existing_purchase_session_is_idempotent(monkeypatch):
    user = SimpleNamespace(id=uuid4(), email="u@example.com", full_name="User", stripe_customer_id=None)
    db = AsyncMock()
    db.add = lambda *_args, **_kwargs: None

    async def fake_execute(stmt):
        return _ExecResult(user)

    db.execute = fake_execute
    db.scalar = AsyncMock(side_effect=[SimpleNamespace(id=uuid4())])  # existing purchase by stripe_session_id
    db.commit = AsyncMock()
    redis = AsyncMock()
    redis.set = AsyncMock(return_value=True)

    monkeypatch.setattr(billing.settings, "STRIPE_WEBHOOK_SECRET", "whsec_test")
    monkeypatch.setattr(
        billing.stripe.Webhook,
        "construct_event",
        lambda payload, sig, secret: {
            "id": "evt_test_existing",
            "type": "checkout.session.completed",
            "data": {
                "object": {
                    "id": "cs_existing",
                    "mode": "payment",
                    "payment_status": "paid",
                    "customer": "cus_1",
                    "metadata": {
                        "user_id": str(user.id),
                        "credit_quantity": "3",
                        "unit_price_cents": "80",
                        "currency": "usd",
                    },
                    "amount_total": 240,
                    "currency": "usd",
                    "payment_intent": "pi_paid",
                }
            },
        },
    )

    award_mock = AsyncMock()
    monkeypatch.setattr(billing.credits_service, "award_onetime_credits_for_user", award_mock)

    out = await billing.stripe_webhook(_Req(), db=db, redis=redis)
    assert out == {"received": True}
    award_mock.assert_not_called()


@pytest.mark.asyncio
async def test_webhook_second_successful_purchase_triggers_upsell(monkeypatch):
    user = SimpleNamespace(id=uuid4(), email="u@example.com", full_name="User", stripe_customer_id=None)
    db = AsyncMock()
    db.add = lambda *_args, **_kwargs: None

    async def fake_execute(stmt):
        return _ExecResult(user)

    db.execute = fake_execute
    db.scalar = AsyncMock(side_effect=[None])  # existing purchase lookup
    db.flush = AsyncMock()
    db.commit = AsyncMock()
    redis = AsyncMock()
    redis.set = AsyncMock(return_value=True)

    monkeypatch.setattr(billing.settings, "STRIPE_WEBHOOK_SECRET", "whsec_test")
    monkeypatch.setattr(
        billing.stripe.Webhook,
        "construct_event",
        lambda payload, sig, secret: {
            "id": "evt_second_purchase",
            "type": "checkout.session.completed",
            "data": {
                "object": {
                    "id": "cs_paid_2",
                    "mode": "payment",
                    "payment_status": "paid",
                    "customer": "cus_1",
                    "metadata": {
                        "user_id": str(user.id),
                        "credit_quantity": "3",
                        "unit_price_cents": "80",
                        "currency": "usd",
                    },
                    "amount_total": 240,
                    "currency": "usd",
                    "payment_intent": "pi_paid_2",
                }
            },
        },
    )

    award_mock = AsyncMock()
    monkeypatch.setattr(billing.credits_service, "award_onetime_credits_for_user", award_mock)
    monkeypatch.setattr(billing, "_monthly_successful_purchase_count", AsyncMock(return_value=2))

    delay_mock = MagicMock()
    fake_task = SimpleNamespace(delay=delay_mock)
    fake_module = types.SimpleNamespace(send_second_purchase_upsell_task=fake_task)
    monkeypatch.setitem(sys.modules, "tasks.email_tasks", fake_module)

    out = await billing.stripe_webhook(_Req(), db=db, redis=redis)
    assert out == {"received": True}
    award_mock.assert_called_once()
    delay_mock.assert_called_once()
