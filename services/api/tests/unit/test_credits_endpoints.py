"""Unit tests for credit management endpoints."""

import pytest
from unittest.mock import AsyncMock, MagicMock
from types import SimpleNamespace
from uuid import uuid4
from datetime import datetime, timezone

from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import get_current_user
from main import app
from models.credit_purchase import CreditPurchase


@pytest.fixture
def mock_user():
    """Create a mock user."""
    return SimpleNamespace(
        id=uuid4(),
        email="test@example.com",
        full_name="Test User",
    )


@pytest.fixture
def mock_db():
    """Create a mock async database session."""
    return AsyncMock(spec=AsyncSession)


@pytest.mark.asyncio
async def test_get_credit_balance(mock_user, mock_db, monkeypatch):
    """Test GET /credits/balance endpoint."""
    async def _override_user():
        return mock_user

    async def _override_db():
        return mock_db

    app.dependency_overrides[get_current_user] = _override_user
    app.dependency_overrides[get_db] = _override_db

    try:
        from routers import credits as credits_router

        monkeypatch.setattr(credits_router.credits_service, "get_credit_accounting_snapshot", AsyncMock(return_value={
            "available_total": 150,
            "plan": {"allocated": 60, "used": 10, "remaining": 50},
            "purchased": {"purchased_total": 110, "used": 10, "remaining": 100},
        }))
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/credits/balance")
        assert response.status_code == 200
        data = response.json()
        assert data["balance"]["total"] == 150
        assert data["balance"]["monthly"] == 50
        assert data["balance"]["purchased"] == 100
        assert data["balance"]["available_total"] == 150
        assert data["balance"]["plan"] == {"allocated": 60, "used": 10, "remaining": 50}
        assert data["balance"]["purchased_position"] == {"purchased_total": 110, "used": 10, "remaining": 100}
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_get_credit_packages():
    """Test GET /credits/pricing endpoint."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/credits/pricing")
    assert response.status_code == 200
    data = response.json()
    assert "pricing" in data
    assert data["pricing"]["currency"] == "usd"
    tiers = data["pricing"]["tiers"]
    assert {"credits": 3, "price_cents": 399, "price_usd": 3.99} in tiers
    assert {"credits": 6, "price_cents": 799, "price_usd": 7.99} in tiers
    assert all(tier["credits"] >= 3 for tier in tiers)


@pytest.mark.asyncio
async def test_credit_balance_requires_authentication():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/credits/balance")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_get_purchase_history(mock_user, mock_db):
    """Test GET /credits/purchase-history endpoint."""
    purchase = CreditPurchase(
        id=uuid4(),
        user_id=mock_user.id,
        quantity=3,
        amount_paid_cents=240,
        currency="usd",
        unit_price_cents=80,
        stripe_event_id="evt_1",
        stripe_session_id="cs_1",
        stripe_payment_intent_id="pi_1",
        stripe_customer_id="cus_1",
        stripe_invoice_id="in_1",
        stripe_charge_id="ch_1",
        receipt_url="https://pay.stripe.com/receipts/test",
        status="completed",
        created_at=datetime.now(timezone.utc),
    )

    async def _override_user():
        return mock_user

    async def _override_db():
        return mock_db

    app.dependency_overrides[get_current_user] = _override_user
    app.dependency_overrides[get_db] = _override_db

    try:
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [purchase]
        mock_db.execute.return_value = mock_result

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/credits/purchase-history")
        assert response.status_code == 200
        data = response.json()
        assert "purchases" in data
        assert "total_purchases" in data
        assert data["total_purchases"] == 1
        record = data["purchases"][0]
        assert record["quantity"] == 3
        assert record["amount_paid_cents"] == 240
        assert record["currency"] == "usd"
        assert record["unit_price_cents"] == 80
        assert record["status"] == "completed"
        assert record["receipt_url"] == "https://pay.stripe.com/receipts/test"
        # Assert internal Stripe identifiers are strictly omitted from response output
        for key in record.keys():
            assert not key.startswith("stripe_"), f"Internal field {key} exposed in purchase history API"
    finally:
        app.dependency_overrides.clear()
