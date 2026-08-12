"""Credit purchase order tracking for one-time Stripe purchases."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID, uuid4


from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, Uuid
from database import Base


class CreditPurchase(Base):
    """Track one-time credit purchases from Stripe.
    
    Used to:
    - Count total purchases per user (for upsell triggers)
    - Log purchase history and amounts
    - Audit trail for billing/support
    """
    __tablename__ = "credit_purchases"

    id: UUID = Column(Uuid, primary_key=True, default=uuid4)
    user_id: UUID = Column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    quantity: int = Column(Integer, nullable=False)  # number of credits purchased
    amount_paid_cents: int = Column(Integer, nullable=False)  # total paid in smallest currency unit
    currency: str = Column(String(8), nullable=False, default="usd")
    unit_price_cents: int = Column(Integer, nullable=False)
    stripe_event_id: str = Column(String(255), nullable=True)  # Stripe webhook event id
    stripe_session_id: str = Column(String(255), nullable=True)  # Stripe checkout session ID
    stripe_payment_intent_id: str = Column(String(255), nullable=True)  # Stripe payment intent ID
    stripe_customer_id: str = Column(String(255), nullable=True)
    stripe_invoice_id: str = Column(String(255), nullable=True)
    stripe_charge_id: str = Column(String(255), nullable=True)
    receipt_url: str = Column(String(2048), nullable=True)
    status: str = Column(String(50), default="completed", nullable=False)  # completed, failed, refunded
    created_at: datetime = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False, index=True)
    notes: str = Column(Text, nullable=True)

    def __repr__(self) -> str:
        return (
            f"<CreditPurchase(id={self.id}, user_id={self.user_id}, quantity={self.quantity}, "
            f"amount_paid_cents={self.amount_paid_cents}, currency={self.currency}, status={self.status})>"
        )
