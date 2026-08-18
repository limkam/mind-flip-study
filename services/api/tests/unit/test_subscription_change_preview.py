"""Unit coverage for the two live-Stripe-verified bugs in GET /billing/subscription/preview-change:

1. stripe.Invoice.upcoming was removed from the SDK; the replacement (Invoice.create_preview)
   puts the invoice's own period_end at "now" for an immediate proration invoice — the real
   next billing date only appears on the line items' `period.end`. Confirmed against a real
   Stripe test-mode response before this test was written.
2. The over-quota-after-downgrade notice must mirror the real entitlement check exactly.
"""

from datetime import datetime, timezone
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


@pytest.mark.asyncio
async def test_downgrade_notice_none_when_under_new_limits(monkeypatch):
    monkeypatch.setattr(billing.entitlements_service, "_plan_features", AsyncMock(return_value={"max_books": 2, "max_sets": 5}))
    monkeypatch.setattr(billing, "consumed_quantity", AsyncMock(return_value=1))
    db = AsyncMock()
    user = AsyncMock(id=uuid4())

    notice = await billing._downgrade_over_quota_notice(db, user, "quick_72")

    assert notice is None


@pytest.mark.asyncio
async def test_downgrade_notice_warns_when_over_new_book_limit(monkeypatch):
    monkeypatch.setattr(billing.entitlements_service, "_plan_features", AsyncMock(return_value={"max_books": 2, "max_sets": 5}))
    monkeypatch.setattr(billing, "consumed_quantity", AsyncMock(side_effect=[3, 1]))
    db = AsyncMock()
    user = AsyncMock(id=uuid4())

    notice = await billing._downgrade_over_quota_notice(db, user, "quick_72")

    assert notice is not None
    assert "3 books" in notice
    assert "limit of 2" in notice
