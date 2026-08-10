"""Unit tests for CreditPurchase model."""

from uuid import uuid4

from models.credit_purchase import CreditPurchase


def test_credit_purchase_creation():
    """Test creating a CreditPurchase instance."""
    user_id = uuid4()
    purchase = CreditPurchase(
        user_id=user_id,
        quantity=3,
        amount_paid_cents=240,
        currency="usd",
        unit_price_cents=80,
        stripe_event_id="evt_test_123",
        stripe_session_id="cs_test_123",
        stripe_customer_id="cus_test_123",
        status="completed",
    )

    assert purchase.user_id == user_id
    assert purchase.quantity == 3
    assert purchase.amount_paid_cents == 240
    assert purchase.currency == "usd"
    assert purchase.unit_price_cents == 80
    assert purchase.stripe_event_id == "evt_test_123"
    assert purchase.stripe_session_id == "cs_test_123"
    assert purchase.stripe_customer_id == "cus_test_123"
    assert purchase.status == "completed"


def test_credit_purchase_with_payment_intent():
    """Test CreditPurchase with payment intent ID."""
    purchase = CreditPurchase(
        user_id=uuid4(),
        quantity=2,
        amount_paid_cents=160,
        currency="usd",
        unit_price_cents=80,
        stripe_session_id="cs_test_456",
        stripe_payment_intent_id="pi_test_789",
        status="completed",
    )

    assert purchase.stripe_payment_intent_id == "pi_test_789"



def test_credit_purchase_default_status():
    """Test that status can be set explicitly."""
    purchase = CreditPurchase(
        user_id=uuid4(),
        quantity=1,
        amount_paid_cents=80,
        currency="usd",
        unit_price_cents=80,
        status="completed",
    )
    assert purchase.status == "completed"

def test_credit_purchase_repr():
    """Test string representation of CreditPurchase."""
    user_id = uuid4()
    purchase = CreditPurchase(
        user_id=user_id,
        quantity=3,
        amount_paid_cents=240,
        currency="usd",
        unit_price_cents=80,
        status="completed",
    )

    repr_str = repr(purchase)
    assert "CreditPurchase" in repr_str
    assert "quantity=3" in repr_str
    assert "amount_paid_cents=240" in repr_str
