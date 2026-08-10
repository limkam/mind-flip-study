from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

import routers.billing as billing


def test_subscription_period_end_supports_item_level_stripe_payload():
    expected = 1_788_467_569
    result = billing._subscription_period_end_dt({
        "items": {"data": [{"current_period_end": expected}]},
    })
    assert result == datetime.fromtimestamp(expected, tz=timezone.utc)


class _Req:
    def __init__(self):
        self.headers = {"stripe-signature": "sig"}

    async def body(self):
        return b"{}"


@pytest.mark.asyncio
async def test_invoice_payment_failed_marks_subscription_past_due(monkeypatch):
    internal_sub = SimpleNamespace(status="active")

    db = AsyncMock()
    db.add = lambda *_args, **_kwargs: None
    db.scalar = AsyncMock(return_value=internal_sub)
    db.commit = AsyncMock()
    redis = AsyncMock()
    redis.set = AsyncMock(return_value=True)

    monkeypatch.setattr(billing.settings, "STRIPE_WEBHOOK_SECRET", "whsec_test")
    monkeypatch.setattr(
        billing.stripe.Webhook,
        "construct_event",
        lambda payload, sig, secret: {
            "id": "evt_inv_failed",
            "type": "invoice.payment_failed",
            "data": {
                "object": {
                    "subscription": "sub_123",
                }
            },
        },
    )

    out = await billing.stripe_webhook(_Req(), db=db, redis=redis)
    assert out == {"received": True}
    assert internal_sub.status == "past_due"
    db.commit.assert_called_once()


@pytest.mark.asyncio
async def test_invoice_payment_succeeded_reactivates_and_updates_period_end(monkeypatch):
    internal_sub = SimpleNamespace(status="past_due", current_period_end=None)

    db = AsyncMock()
    db.add = lambda *_args, **_kwargs: None
    db.scalar = AsyncMock(return_value=internal_sub)
    db.commit = AsyncMock()
    redis = AsyncMock()
    redis.set = AsyncMock(return_value=True)

    monkeypatch.setattr(billing.settings, "STRIPE_WEBHOOK_SECRET", "whsec_test")
    monkeypatch.setattr(
        billing.stripe.Webhook,
        "construct_event",
        lambda payload, sig, secret: {
            "id": "evt_inv_paid",
            "type": "invoice.payment_succeeded",
            "data": {
                "object": {
                    "subscription": "sub_123",
                    "lines": {
                        "data": [
                            {
                                "period": {
                                    "end": 1793577600,
                                }
                            }
                        ]
                    },
                }
            },
        },
    )

    out = await billing.stripe_webhook(_Req(), db=db, redis=redis)
    assert out == {"received": True}
    assert internal_sub.status == "active"
    assert internal_sub.current_period_end is not None
    db.commit.assert_called_once()


@pytest.mark.asyncio
async def test_invoice_payment_succeeded_can_relink_missing_internal_subscription(monkeypatch):
    user = SimpleNamespace(id=uuid4(), stripe_customer_id="cus_123")
    plan = SimpleNamespace(id=uuid4(), slug="standard_15", monthly_content_allowance=15, monthly_regen_allowance=15)

    db = AsyncMock()
    db.commit = AsyncMock()
    db.add = lambda *_args, **_kwargs: None
    db.scalar = AsyncMock(side_effect=[None, user, plan, None, None, None])
    db.get = AsyncMock(return_value=plan)

    redis = AsyncMock()
    redis.set = AsyncMock(return_value=True)

    monkeypatch.setattr(billing.settings, "STRIPE_WEBHOOK_SECRET", "whsec_test")
    monkeypatch.setattr(billing.settings, "STRIPE_PRICE_ID_STANDARD_MONTHLY", "price_std_month")
    monkeypatch.setattr(
        billing.stripe.Webhook,
        "construct_event",
        lambda payload, sig, secret: {
            "id": "evt_inv_relink",
            "type": "invoice.payment_succeeded",
            "data": {
                "object": {
                    "subscription": "sub_missing",
                    "customer": "cus_123",
                    "lines": {
                        "data": [
                            {
                                "price": {"id": "price_std_month"},
                                "period": {
                                    "end": 1793577600,
                                },
                            }
                        ]
                    },
                }
            },
        },
    )

    out = await billing.stripe_webhook(_Req(), db=db, redis=redis)
    assert out == {"received": True}
    db.commit.assert_called_once()
