"""Unit coverage for the two live-Stripe-verified bugs in GET /billing/subscription/preview-change:

1. stripe.Invoice.upcoming was removed from the SDK; the replacement (Invoice.create_preview)
   puts the invoice's own period_end at "now" for an immediate proration invoice — the real
   next billing date only appears on the line items' `period.end`. Confirmed against a real
   Stripe test-mode response before this test was written.
2. The over-quota-after-downgrade notice must mirror the real entitlement check exactly.
"""

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

import routers.billing as billing


def test_next_billing_date_from_preview_uses_line_item_period_not_top_level():
    # Real shape from a live Stripe test-mode Invoice.create_preview call: top-level
    # period_end/created is the immediate proration invoice's own timestamp ("now"), not
    # the subscription's next renewal.
    preview = {
        "period_end": 1787009341,  # "now" at preview time
        "lines": {
            "data": [
                {"description": "Unused time", "period": {"start": 1787009341, "end": 1789687529}},
                {"description": "Remaining time", "period": {"start": 1787009341, "end": 1789687529}},
            ],
        },
    }
    result = billing._next_billing_date_from_preview(preview)
    assert result == datetime.fromtimestamp(1789687529, tz=timezone.utc)


def test_next_billing_date_from_preview_falls_back_when_no_line_items():
    preview = {"period_end": 1787009341, "lines": {"data": []}}
    result = billing._next_billing_date_from_preview(preview)
    assert result == datetime.fromtimestamp(1787009341, tz=timezone.utc)


def test_proration_breakdown_splits_credit_and_charge_lines():
    preview = {
        "lines": {
            "data": [
                {"description": "Unused time on Quick 7", "amount": -899},
                {"description": "Remaining time on Standard 15", "amount": 1200},
            ],
        },
    }
    credit_cents, charge_cents = billing._proration_breakdown_from_preview(preview)
    assert credit_cents == 899
    assert charge_cents == 1200


def test_proration_breakdown_handles_no_line_items():
    assert billing._proration_breakdown_from_preview({"lines": {"data": []}}) == (0, 0)


@pytest.mark.asyncio
async def test_retry_past_due_invoice_noop_when_not_past_due(monkeypatch):
    user = AsyncMock(id=uuid4())
    monkeypatch.setattr(
        billing, "_latest_subscription_row",
        AsyncMock(return_value=SimpleNamespace(status="active", stripe_subscription_id="sub_123")),
    )
    db = AsyncMock()

    result = await billing._retry_past_due_invoice_for_user(db, user)

    assert result == {"had_past_due_invoice": False, "resolved": False}


@pytest.mark.asyncio
async def test_retry_past_due_invoice_pays_open_invoice_and_syncs(monkeypatch):
    user = AsyncMock(id=uuid4())
    monkeypatch.setattr(
        billing, "_latest_subscription_row",
        AsyncMock(return_value=SimpleNamespace(status="past_due", stripe_subscription_id="sub_123")),
    )
    monkeypatch.setattr(billing, "_acquire_business_lock", AsyncMock())
    monkeypatch.setattr(billing.settings, "STRIPE_SECRET_KEY", "sk_test_x")
    monkeypatch.setattr(
        billing.stripe.Subscription, "retrieve",
        lambda *a, **k: SimpleNamespace(to_dict=lambda: {
            "id": "sub_123",
            "latest_invoice": {"id": "in_456", "status": "open"},
        }),
    )
    monkeypatch.setattr(
        billing.stripe.Invoice, "pay",
        lambda *a, **k: SimpleNamespace(to_dict=lambda: {"id": "in_456", "status": "paid"}),
    )
    sync = AsyncMock(return_value=True)
    monkeypatch.setattr(billing, "_sync_subscription_from_stripe_object", sync)
    db = AsyncMock()

    result = await billing._retry_past_due_invoice_for_user(db, user)

    assert result == {"had_past_due_invoice": True, "resolved": True}
    sync.assert_awaited_once()


@pytest.mark.asyncio
async def test_retry_past_due_invoice_survives_stripe_failure(monkeypatch):
    user = AsyncMock(id=uuid4())
    monkeypatch.setattr(
        billing, "_latest_subscription_row",
        AsyncMock(return_value=SimpleNamespace(status="past_due", stripe_subscription_id="sub_123")),
    )
    monkeypatch.setattr(billing, "_acquire_business_lock", AsyncMock())
    monkeypatch.setattr(billing.settings, "STRIPE_SECRET_KEY", "sk_test_x")

    def _boom(*a, **k):
        raise RuntimeError("card declined")

    monkeypatch.setattr(billing.stripe.Subscription, "retrieve", _boom)
    db = AsyncMock()

    result = await billing._retry_past_due_invoice_for_user(db, user)

    assert result == {"had_past_due_invoice": True, "resolved": False}


@pytest.mark.asyncio
async def test_downgrade_notice_none_when_under_new_content_allowance(monkeypatch):
    # quick_72's content allowance is max_books(2) + max_sets(5) = 7; 1 book + 1 set = 2 is under it.
    monkeypatch.setattr(billing.entitlements_service, "_plan_features", AsyncMock(return_value={"max_books": 2, "max_sets": 5}))
    monkeypatch.setattr(billing, "consumed_quantity", AsyncMock(return_value=1))
    db = AsyncMock()
    user = AsyncMock(id=uuid4())

    notice = await billing._downgrade_over_quota_notice(db, user, "quick_72")

    assert notice is None


@pytest.mark.asyncio
async def test_downgrade_notice_warns_when_over_new_combined_content_allowance(monkeypatch):
    # quick_72's content allowance is max_books(2) + max_sets(5) = 7; 6 books + 3 sets = 9 exceeds it.
    monkeypatch.setattr(billing.entitlements_service, "_plan_features", AsyncMock(return_value={"max_books": 2, "max_sets": 5}))
    monkeypatch.setattr(billing, "consumed_quantity", AsyncMock(side_effect=[6, 3]))
    db = AsyncMock()
    user = AsyncMock(id=uuid4())

    notice = await billing._downgrade_over_quota_notice(db, user, "quick_72")

    assert notice is not None
    assert "6 books" in notice
    assert "3 flashcard sets" in notice
