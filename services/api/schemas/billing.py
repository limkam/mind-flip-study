from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field


class CheckoutClient(str, Enum):
    web = "web"
    mobile = "mobile"


class CheckoutUrlResponse(BaseModel):
    checkout_url: str = Field(..., description="Stripe-hosted Checkout URL")


class CheckoutVerificationResponse(BaseModel):
    session_id: str
    checkout_status: str = Field(..., description="'open', 'complete', or 'expired'")
    subscription_state: str = Field(..., description="'active', 'processing', 'conflict', or 'not_confirmed'")
    plan_slug: str | None = None
    interval: str | None = None


class EntitlementActionDecision(BaseModel):
    allowed: bool
    reason: str | None = None
    upgrade_hook: dict | None = None
    consume: dict | None = None


class EntitlementBalances(BaseModel):
    monthly_content_credits: int
    purchased_credits: int
    monthly_regen_credits: int


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


class BillingPricingResponse(BaseModel):
    default_interval: str = "annual"
    plans: dict[str, BillingPlanPrice]


class SubscriptionCancelResponse(BaseModel):
    canceled_at_period_end: bool
    current_period_end: datetime | None = None


class TrialEligibilityResponse(BaseModel):
    eligible: bool
    reason: str | None = None
    signals: dict
    trial_days: int = Field(7, description="Trial period duration in days")
