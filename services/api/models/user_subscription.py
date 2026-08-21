"""User subscription / entitlement record."""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, ForeignKey, Index, Integer, String, DateTime
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from database import Base


class UserSubscription(Base):
    __tablename__ = "user_subscriptions"
    __table_args__ = (
        Index("ix_user_subscriptions_status_period_user", "status", "current_period_end", "user_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    plan_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("plans.id", ondelete="RESTRICT"), nullable=False, index=True)
    stripe_subscription_id: Mapped[str | None] = mapped_column(String(255), nullable=True, unique=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="active")
    billing_interval: Mapped[str | None] = mapped_column(String(16), nullable=True)
    stripe_price_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    unit_amount_cents: Mapped[int | None] = mapped_column(Integer, nullable=True)
    interval_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    subscription_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    current_period_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    current_period_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancel_at_period_end: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    cancel_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    canceled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    trial_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    trial_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    pause_collection: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    stripe_event_created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # A scheduled downgrade (see POST /billing/subscription/change): Stripe applies the price
    # swap at current_period_end via a SubscriptionSchedule, with no proration today. These are
    # set immediately so the UI can show "downgrading to X on <date>" without waiting on a
    # webhook, and cleared once the scheduled swap lands (see _sync_subscription_from_stripe_object).
    pending_plan_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("plans.id", ondelete="SET NULL"), nullable=True)
    pending_price_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    pending_change_effective_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    stripe_schedule_id: Mapped[str | None] = mapped_column(String(255), nullable=True)

    cancellation_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Dunning: incremented on each invoice.payment_failed webhook for this subscription,
    # reset to 0 on the next invoice.payment_succeeded. dunning_stage is the retry attempt
    # count Stripe has told us about — no separate structured "stage" ladder exists, so this
    # field also serves as the stage number for display purposes.
    dunning_stage: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    dunning_attempt_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    dunning_last_attempt_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
