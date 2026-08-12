from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from fastapi import HTTPException

import routers.billing as billing


def _db_rows(rows):
    db = AsyncMock()
    result = MagicMock()
    result.scalars.return_value.all.return_value = rows
    db.execute = AsyncMock(return_value=result)
    return db


@pytest.mark.asyncio
async def test_local_overview_resolution_never_calls_stripe(monkeypatch):
    stripe_list = MagicMock()
    monkeypatch.setattr(billing.stripe.Subscription, "list", stripe_list)
    row = SimpleNamespace(stripe_subscription_id="sub_local")

    result = await billing._local_subscription_resolution(_db_rows([row]), uuid4())

    assert result == {"state": "active", "count": 1}
    stripe_list.assert_not_called()


@pytest.mark.asyncio
async def test_local_overview_resolution_preserves_conflict(monkeypatch):
    stripe_list = MagicMock()
    monkeypatch.setattr(billing.stripe.Subscription, "list", stripe_list)
    rows = [
        SimpleNamespace(stripe_subscription_id="sub_1"),
        SimpleNamespace(stripe_subscription_id="sub_2"),
    ]

    result = await billing._local_subscription_resolution(_db_rows(rows), uuid4())

    assert result == {"state": "subscription_conflict", "count": 2}
    stripe_list.assert_not_called()


@pytest.mark.asyncio
async def test_invoice_failure_is_local_to_invoice_endpoint(monkeypatch):
    user = SimpleNamespace(id=uuid4(), stripe_customer_id="cus_1")
    monkeypatch.setattr(billing.settings, "STRIPE_SECRET_KEY", "sk_test")
    monkeypatch.setattr(billing.asyncio, "to_thread", AsyncMock(side_effect=TimeoutError))

    with pytest.raises(HTTPException) as error:
        await billing.billing_invoices(current_user=user)

    assert error.value.status_code == 503
    assert error.value.detail["code"] == "INVOICES_UNAVAILABLE"


@pytest.mark.asyncio
async def test_payment_method_returns_only_masked_card_metadata(monkeypatch):
    user = SimpleNamespace(id=uuid4(), stripe_customer_id="cus_1")
    monkeypatch.setattr(billing.settings, "STRIPE_SECRET_KEY", "sk_test")
    monkeypatch.setattr(
        billing.asyncio,
        "to_thread",
        AsyncMock(return_value=SimpleNamespace(data=[{
            "id": "pm_secret",
            "card": {"brand": "visa", "last4": "4242", "exp_month": 12, "exp_year": 2030, "cvc_check": "pass"},
        }])),
    )

    result = await billing.billing_payment_method(current_user=user)

    assert result == {"payment_method": {"brand": "visa", "last4": "4242", "exp_month": 12, "exp_year": 2030}}
    assert "id" not in result["payment_method"]
    assert "cvc_check" not in result["payment_method"]
