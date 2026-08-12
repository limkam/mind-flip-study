import pytest
from types import SimpleNamespace
from uuid import uuid4
from unittest.mock import AsyncMock, MagicMock

import routers.billing as billing


class _ExecResult:
    def __init__(self, user):
        self._user = user

    def scalar_one(self):
        return self._user

    def scalar_one_or_none(self):
        return self._user


@pytest.mark.asyncio
async def test_credit_checkout_session_uses_quantity_and_unit_price(monkeypatch):
    user = SimpleNamespace(id=uuid4(), email="test@example.com", stripe_customer_id=None)
    db = AsyncMock()
    db.execute = AsyncMock(return_value=_ExecResult(user))
    db.commit = AsyncMock()
    db.refresh = AsyncMock()

    monkeypatch.setattr(billing.settings, "STRIPE_SECRET_KEY", "sk_test")
    monkeypatch.setattr(billing.settings, "STRIPE_PRICE_ID_CREDIT_UNIT", "")
    monkeypatch.setattr(billing.settings, "CREDIT_UNIT_PRICE_CENTS", 80)
    monkeypatch.setattr(billing.settings, "CREDIT_CURRENCY", "usd")

    monkeypatch.setattr(
        billing.stripe.Customer,
        "create",
        lambda **kwargs: SimpleNamespace(id="cus_test"),
    )

    captured = {}

    def fake_create(**kwargs):
        captured.update(kwargs)
        return SimpleNamespace(url="https://checkout.stripe.test/session")

    monkeypatch.setattr(billing.stripe.checkout.Session, "create", fake_create)

    resp = await billing.create_credit_checkout_session(current_user=user, db=db, quantity=3)

    assert resp.checkout_url.startswith("https://")
    assert captured["mode"] == "payment"
    assert captured["line_items"][0]["quantity"] == 3
    assert captured["line_items"][0]["price_data"]["unit_amount"] == 80
    assert captured["metadata"]["credit_quantity"] == "3"
    assert captured["metadata"]["unit_price_cents"] == "80"


@pytest.mark.asyncio
async def test_monthly_successful_purchase_count_filters_completed_and_month(monkeypatch):
    captured = {}

    class _Db:
        async def scalar(self, stmt):
            captured["stmt"] = str(stmt)
            return 2

    count = await billing._monthly_successful_purchase_count(_Db(), uuid4(), billing.datetime.now(billing.timezone.utc))
    assert count == 2
    assert "credit_purchases.status" in captured["stmt"]
    assert "credit_purchases.created_at" in captured["stmt"]


def test_credit_checkout_line_item_uses_price_id_when_configured(monkeypatch):
    monkeypatch.setattr(billing.settings, "STRIPE_PRICE_ID_CREDIT_UNIT", "price_unit_123")
    out = billing._credit_checkout_line_item(7)
    assert out == {"price": "price_unit_123", "quantity": 7}


@pytest.mark.asyncio
async def test_credit_checkout_verification_returns_tagged_union_credit_purchase(monkeypatch):
    user = SimpleNamespace(id=uuid4(), email="test@example.com", stripe_customer_id="cus_123")
    db = AsyncMock()
    db.scalar = AsyncMock(return_value=SimpleNamespace(status="completed", credit_quantity=5, unit_price_cents=80, currency="usd"))

    fake_session = {
        "id": "cs_test_credit",
        "status": "complete",
        "mode": "payment",
        "payment_status": "paid",
        "customer": "cus_123",
        "client_reference_id": str(user.id),
        "metadata": {
            "user_id": str(user.id),
            "credit_quantity": "5",
            "unit_price_cents": "80",
            "currency": "usd",
        },
    }

    monkeypatch.setattr(billing.stripe.checkout.Session, "retrieve", lambda session_id: fake_session)

    resp = await billing.verify_checkout_session(session_id="cs_test_credit", current_user=user, db=db)

    assert resp.checkout_kind == "credit_purchase"
    assert resp.purchase_state == "credited"
    assert resp.subscription_state is None
    assert resp.credit_quantity == 5
    assert resp.unit_price_cents == 80
    assert resp.currency == "usd"


@pytest.mark.asyncio
async def test_credit_checkout_complete_but_unpaid_is_not_fulfilled(monkeypatch):
    user = SimpleNamespace(id=uuid4(), stripe_customer_id="cus_123")
    db = AsyncMock()
    db.scalar = AsyncMock(return_value=None)
    monkeypatch.setattr(billing.stripe.checkout.Session, "retrieve", lambda _session_id: {
        "status": "complete", "mode": "payment", "payment_status": "unpaid",
        "customer": "cus_123", "client_reference_id": str(user.id),
        "metadata": {"user_id": str(user.id)},
    })

    response = await billing.verify_checkout_session("cs_test_unpaid", user, db)

    assert response.purchase_state == "not_confirmed"


@pytest.mark.asyncio
async def test_credit_checkout_urls_enforce_https_in_production(monkeypatch):
    user = SimpleNamespace(id=uuid4(), email="test@example.com", stripe_customer_id="cus_123")
    db = AsyncMock()
    db.execute = AsyncMock(return_value=_ExecResult(user))

    monkeypatch.setattr(billing.settings, "ENVIRONMENT", "production")
    object.__setattr__(billing.settings, "MOBILE_CREDIT_CHECKOUT_SUCCESS_URL", "http://insecure.app/success")
    object.__setattr__(billing.settings, "MOBILE_CREDIT_CHECKOUT_CANCEL_URL", "http://insecure.app/cancel")

    with pytest.raises(billing.HTTPException) as exc_info:
        await billing.create_credit_checkout_session(current_user=user, db=db, quantity=1, client=billing.CheckoutClient.mobile)

    assert exc_info.value.status_code == 500
    assert "HTTPS" in exc_info.value.detail


@pytest.mark.asyncio
async def test_credit_checkout_assigns_stripe_receipt_destination(monkeypatch):
    user = SimpleNamespace(id=uuid4(), email="receipt@example.com", stripe_customer_id="cus_123")
    db = AsyncMock()
    db.execute = AsyncMock(return_value=_ExecResult(user))
    create = MagicMock(return_value=SimpleNamespace(url="https://checkout.stripe.test/session"))
    monkeypatch.setattr(billing.stripe.checkout.Session, "create", create)
    monkeypatch.setattr(billing.settings, "STRIPE_SECRET_KEY", "sk_test")

    await billing.create_credit_checkout_session(
        current_user=user, db=db, quantity=3, client=billing.CheckoutClient.web,
    )

    params = create.call_args.kwargs
    assert params["mode"] == "payment"
    assert params["payment_intent_data"]["receipt_email"] == user.email
    assert params["payment_intent_data"]["metadata"]["credit_quantity"] == "3"


@pytest.mark.asyncio
async def test_webhook_payment_rejects_amount_and_currency_mismatch(monkeypatch):
    user = SimpleNamespace(id=uuid4(), email="test@example.com", stripe_customer_id="cus_123")
    db = AsyncMock()
    db.execute = AsyncMock(return_value=_ExecResult(user))
    db.scalar = AsyncMock(return_value=None)
    db.commit = AsyncMock()
    db.add = MagicMock()
    redis = AsyncMock()

    monkeypatch.setattr(billing.settings, "CREDIT_UNIT_PRICE_CENTS", 80)
    monkeypatch.setattr(billing.settings, "CREDIT_CURRENCY", "usd")

    event = {
        "id": "evt_test",
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "id": "cs_mismatch",
                "mode": "payment",
                "payment_status": "paid",
                "amount_total": 50, # Mismatch: expected 5 * 80 = 400
                "currency": "eur", # Mismatch: expected usd
                "customer": "cus_123",
                "metadata": {
                    "user_id": str(user.id),
                    "credit_quantity": "5",
                    "unit_price_cents": "80",
                },
            }
        },
    }

    award_mock = AsyncMock()
    monkeypatch.setattr(billing.credits_service, "award_onetime_credits_for_user", award_mock)

    req = SimpleNamespace(
        body=AsyncMock(return_value=b"{}"),
        headers={"stripe-signature": "sig"},
    )
    monkeypatch.setattr(billing.stripe.Webhook, "construct_event", lambda body, sig, secret: event)

    res = await billing.stripe_webhook(request=req, db=db, redis=redis)
    assert res == {"received": True}
    award_mock.assert_not_called()
