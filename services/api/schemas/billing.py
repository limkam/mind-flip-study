from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field


class CheckoutClient(str, Enum):
    web = "web"
    mobile = "mobile"


class CheckoutUrlResponse(BaseModel):
    checkout_url: str = Field(..., description="Stripe-hosted Checkout URL")


class CheckoutVerificationResponse(BaseModel):
    checkout_kind: str = Field("subscription", description="'subscription' or 'credit_purchase'")
    session_id: str
    checkout_status: str = Field(..., description="'open', 'complete', or 'expired'")
    subscription_state: str | None = Field(None, description="'active', 'processing', 'conflict', or 'not_confirmed'")
    purchase_state: str | None = Field(None, description="'processing', 'credited', or 'not_confirmed'")
    plan_slug: str | None = None
    interval: str | None = None
    credit_quantity: int | None = None
    unit_price_cents: int | None = None
    amount_paid_cents: int | None = None
    currency: str | None = None


class EntitlementActionDecision(BaseModel):
    allowed: bool
    reason: str | None = None
    upgrade_hook: dict | None = None
    consume: dict | None = None


class EntitlementBalances(BaseModel):
    monthly_content_credits: int
    purchased_credits: int
    monthly_regen_credits: int
    available_total: int
    plan_allocated_credits: int
    plan_used_credits: int
    purchased_total_credits: int
    purchased_used_credits: int


class EntitlementFeatures(BaseModel):
    create_book: bool
    create_flashcard_set: bool
    games: bool
    games_limit: int
    challenges: bool
    study_group_creation: bool
    priority_processing: bool
    daily_review_limit: int | None = None
    regeneration: bool


class EntitlementsSnapshotResponse(BaseModel):
    plan_slug: str
    subscription_status: str
    billing_interval: str | None = None
    renewal_or_end_date: datetime | None = None
    balances: EntitlementBalances
    features: EntitlementFeatures
    actions: dict[str, EntitlementActionDecision]
    raw_plan_features: dict


class BillingPlanPrice(BaseModel):
    monthly_price_cents: int | None = None
    annual_price_cents: int | None = None
    annual_savings_cents: int | None = None
    stripe_price_id_monthly: str | None = None
    stripe_price_id_annual: str | None = None
    most_popular: bool = False


class BillingPricingResponse(BaseModel):
    default_interval: str = "annual"
    plans: dict[str, BillingPlanPrice]


class SubscriptionCancelRequest(BaseModel):
    reason: str | None = Field(None, max_length=255)


class SubscriptionCancelResponse(BaseModel):
    canceled_at_period_end: bool
    current_period_end: datetime | None = None


class SubscriptionChangePreviewResponse(BaseModel):
    is_upgrade: bool
    plan_slug: str
    billing_interval: str
    amount_due_today_cents: int
    new_recurring_amount_cents: int
    currency: str = "usd"
    effective: str = Field(..., description="'immediately' or 'next_period'")
    next_billing_date: datetime | None = None
    proration_credit_cents: int = Field(
        0,
        description=(
            "Upgrades only: credit for unused time on the current plan, as a positive "
            "magnitude (already netted into amount_due_today_cents, shown separately for "
            "breakdown display). 0 for downgrades."
        ),
    )
    proration_charge_cents: int = Field(
        0,
        description=(
            "Upgrades only: charge for the remaining time on the new plan this period "
            "(already netted into amount_due_today_cents, shown separately for breakdown "
            "display). 0 for downgrades."
        ),
    )
    downgrade_notice: str | None = Field(
        None,
        description=(
            "Set only for downgrades where current usage already meets or exceeds the "
            "target plan's limits. Existing content is never removed on downgrade — this "
            "just warns that new creation/activation will be blocked until usage is back "
            "under the new limit."
        ),
    )


class SubscriptionChangeResponse(BaseModel):
    is_upgrade: bool
    plan_slug: str
    billing_interval: str
    effective: str = Field(..., description="'immediately' or 'next_period'")
    pending_change_effective_at: datetime | None = None
