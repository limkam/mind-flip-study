"""Stripe Checkout + webhooks."""

from __future__ import annotations

import uuid
import logging
import asyncio
from datetime import datetime, timezone
from enum import Enum
from typing import Annotated
from uuid import UUID

import stripe
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from redis.asyncio import Redis
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from database import get_db
from dependencies import get_current_user, get_redis
from models.plan import Plan
from models.user_subscription import UserSubscription
from models.billing_analytics import BillingEvent, BillingInvoice
from models.user import User
from models.credit_purchase import CreditPurchase
from models.credit_ledger import CreditLedger
from models.book import Book
from models.flashcard import FlashcardSet
from schemas.billing import CheckoutUrlResponse, CheckoutClient, CheckoutVerificationResponse
from schemas.billing import (
    BillingPricingResponse,
    BillingPlanPrice,
    EntitlementActionDecision,
    EntitlementBalances,
    EntitlementFeatures,
    EntitlementsSnapshotResponse,
    SubscriptionCancelResponse,
    TrialEligibilityResponse,
)
from services import credits as credits_service
from services import entitlements as entitlements_service

router = APIRouter(tags=["billing"])
logger = logging.getLogger(__name__)


class BillingPlan(str, Enum):
    quick = "quick"
    standard = "standard"
    basic = "basic"
    premium = "premium"


class BillingInterval(str, Enum):
    monthly = "monthly"
    annual = "annual"


def _quick_price_id(interval: BillingInterval) -> str:
    """Support the original Quick 7 environment variable names."""
    if interval == BillingInterval.annual:
        return (
            settings.STRIPE_PRICE_ID_QUICK_ANNUAL
            or settings.STRIPE_PRICE_ID_QUICK7_YEARLY
        )
    return settings.STRIPE_PRICE_ID_QUICK_MONTHLY or settings.STRIPE_PRICE_ID_QUICK7_MONTHLY


def _price_id_for_plan(plan: BillingPlan, interval: BillingInterval) -> str:
    normalized = BillingPlan.standard if plan == BillingPlan.basic else plan

    if normalized == BillingPlan.quick:
        return _quick_price_id(interval)

    if normalized == BillingPlan.premium:
        if interval == BillingInterval.annual:
            return (
                getattr(settings, "STRIPE_PRICE_ID_PREMIUM_ANNUAL", "")
                or settings.STRIPE_PRICE_ID_PREMIUM
            )
        return (
            getattr(settings, "STRIPE_PRICE_ID_PREMIUM_MONTHLY", "")
            or settings.STRIPE_PRICE_ID_PREMIUM
        )

    # Treat `basic` as legacy alias for `standard`.
    if interval == BillingInterval.annual:
        return (
            getattr(settings, "STRIPE_PRICE_ID_STANDARD_ANNUAL", "")
            or settings.STRIPE_PRICE_ID_BASIC
            or settings.STRIPE_PRICE_ID
        )
    return (
        getattr(settings, "STRIPE_PRICE_ID_STANDARD_MONTHLY", "")
        or settings.STRIPE_PRICE_ID_BASIC
        or settings.STRIPE_PRICE_ID
    )


_CREDIT_MAX_QUANTITY = 10_000


def _credit_unit_price_cents() -> int:
    return max(1, int(settings.CREDIT_UNIT_PRICE_CENTS))


def _credit_currency() -> str:
    return (settings.CREDIT_CURRENCY or "usd").lower()


def _credit_checkout_line_item(quantity: int) -> dict:
    unit_price_id = settings.STRIPE_PRICE_ID_CREDIT_UNIT.strip()
    if unit_price_id:
        return {"price": unit_price_id, "quantity": quantity}
    return {
        "price_data": {
            "currency": _credit_currency(),
            "unit_amount": _credit_unit_price_cents(),
            "product_data": {"name": "MindFlip Credits"},
        },
        "quantity": quantity,
    }


def _month_bounds_utc(dt: datetime) -> tuple[datetime, datetime]:
    start = datetime(dt.year, dt.month, 1, tzinfo=timezone.utc)
    if dt.month == 12:
        end = datetime(dt.year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        end = datetime(dt.year, dt.month + 1, 1, tzinfo=timezone.utc)
    return start, end


async def _monthly_successful_purchase_count(db: AsyncSession, user_id: UUID, dt: datetime) -> int:
    month_start, month_end = _month_bounds_utc(dt)
    count = await db.scalar(
        select(func.count(CreditPurchase.id)).where(
            CreditPurchase.user_id == user_id,
            CreditPurchase.status == "completed",
            CreditPurchase.created_at >= month_start,
            CreditPurchase.created_at < month_end,
        )
    )
    return int(count or 0)


def _subscription_tier_for_plan(plan: str | None) -> str:
    if plan == BillingPlan.premium.value:
        return "premium"
    return "student"


def _plan_slug_for_metadata(plan: str | None) -> str:
    if plan == BillingPlan.premium.value:
        return "premium_30"
    if plan == BillingPlan.quick.value:
        return "quick_72"
    return "standard_15"


def _interval_for_price_id(price_id: str | None) -> str | None:
    if not price_id:
        return None
    pid = str(price_id)
    if pid in {
        _quick_price_id(BillingInterval.annual),
        getattr(settings, "STRIPE_PRICE_ID_STANDARD_ANNUAL", ""),
        getattr(settings, "STRIPE_PRICE_ID_PREMIUM_ANNUAL", ""),
    }:
        return BillingInterval.annual.value
    if pid in {
        _quick_price_id(BillingInterval.monthly),
        getattr(settings, "STRIPE_PRICE_ID_STANDARD_MONTHLY", ""),
        getattr(settings, "STRIPE_PRICE_ID_PREMIUM_MONTHLY", ""),
    }:
        return BillingInterval.monthly.value
    return None


def _plan_slug_and_tier_for_price_id(price_id: str | None) -> tuple[str | None, str | None, str | None]:
    if not price_id:
        return None, None, None
    pid = str(price_id)
    premium_ids = {
        settings.STRIPE_PRICE_ID_PREMIUM,
        getattr(settings, "STRIPE_PRICE_ID_PREMIUM_MONTHLY", ""),
        getattr(settings, "STRIPE_PRICE_ID_PREMIUM_ANNUAL", ""),
    }
    standard_ids = {
        settings.STRIPE_PRICE_ID_BASIC,
        settings.STRIPE_PRICE_ID,
        getattr(settings, "STRIPE_PRICE_ID_STANDARD_MONTHLY", ""),
        getattr(settings, "STRIPE_PRICE_ID_STANDARD_ANNUAL", ""),
    }
    quick_ids = {
        _quick_price_id(BillingInterval.monthly),
        _quick_price_id(BillingInterval.annual),
    }
    premium_ids = {x for x in premium_ids if x}
    standard_ids = {x for x in standard_ids if x}
    quick_ids = {x for x in quick_ids if x}

    if pid in premium_ids:
        return "premium_30", "premium", _interval_for_price_id(pid)
    if pid in quick_ids:
        return "quick_72", "student", _interval_for_price_id(pid)
    if pid in standard_ids:
        return "standard_15", "student", _interval_for_price_id(pid)
    return None, None, None


def _pricing_plan_catalog() -> dict[str, BillingPlanPrice]:
    plans = {
        "free": BillingPlanPrice(
            monthly_price_cents=0,
            annual_price_cents=0,
            annual_savings_cents=0,
            stripe_price_id_monthly=None,
            stripe_price_id_annual=None,
        ),
        "quick_72": BillingPlanPrice(
            monthly_price_cents=int(settings.BILLING_PRICE_CENTS_QUICK_MONTHLY),
            annual_price_cents=int(settings.BILLING_PRICE_CENTS_QUICK_ANNUAL),
            annual_savings_cents=max(
                int(settings.BILLING_PRICE_CENTS_QUICK_MONTHLY) * 12 - int(settings.BILLING_PRICE_CENTS_QUICK_ANNUAL),
                0,
            ),
            stripe_price_id_monthly=_quick_price_id(BillingInterval.monthly) or None,
            stripe_price_id_annual=_quick_price_id(BillingInterval.annual) or None,
        ),
        "standard_15": BillingPlanPrice(
            monthly_price_cents=int(settings.BILLING_PRICE_CENTS_STANDARD_MONTHLY),
            annual_price_cents=int(settings.BILLING_PRICE_CENTS_STANDARD_ANNUAL),
            annual_savings_cents=max(
                int(settings.BILLING_PRICE_CENTS_STANDARD_MONTHLY) * 12 - int(settings.BILLING_PRICE_CENTS_STANDARD_ANNUAL),
                0,
            ),
            stripe_price_id_monthly=getattr(settings, "STRIPE_PRICE_ID_STANDARD_MONTHLY", "") or None,
            stripe_price_id_annual=getattr(settings, "STRIPE_PRICE_ID_STANDARD_ANNUAL", "") or None,
        ),
        "premium_30": BillingPlanPrice(
            monthly_price_cents=int(settings.BILLING_PRICE_CENTS_PREMIUM_MONTHLY),
            annual_price_cents=int(settings.BILLING_PRICE_CENTS_PREMIUM_ANNUAL),
            annual_savings_cents=max(
                int(settings.BILLING_PRICE_CENTS_PREMIUM_MONTHLY) * 12 - int(settings.BILLING_PRICE_CENTS_PREMIUM_ANNUAL),
                0,
            ),
            stripe_price_id_monthly=getattr(settings, "STRIPE_PRICE_ID_PREMIUM_MONTHLY", "") or None,
            stripe_price_id_annual=getattr(settings, "STRIPE_PRICE_ID_PREMIUM_ANNUAL", "") or None,
        ),
    }
    return plans


async def _latest_subscription_row(db: AsyncSession, user_id: UUID) -> UserSubscription | None:
    return await db.scalar(
        select(UserSubscription)
        .where(UserSubscription.user_id == user_id)
        .order_by(UserSubscription.current_period_end.desc().nullslast(), UserSubscription.created_at.desc())
        .limit(1)
    )


async def _trial_eligibility_signals(db: AsyncSession, user: User) -> dict:
    has_prior_subscription = bool(
        await db.scalar(
            select(UserSubscription.id).where(UserSubscription.user_id == user.id).limit(1)
        )
    )
    has_credit_purchase_history = bool(
        await db.scalar(
            select(CreditPurchase.id).where(CreditPurchase.user_id == user.id).limit(1)
        )
    )
    prefs = dict(user.preferences or {})
    trial_meta = dict(prefs.get("trial") or {})
    trial_used = bool(trial_meta.get("used_at"))
    return {
        "trial_enabled": bool(settings.TRIAL_ENABLED),
        "has_prior_subscription": has_prior_subscription,
        "has_credit_purchase_history": has_credit_purchase_history,
        "trial_used": trial_used,
    }


def _current_period_end_dt(ts: object) -> datetime | None:
    if ts is None:
        return None
    try:
        return datetime.fromtimestamp(int(ts), tz=timezone.utc)
    except (TypeError, ValueError, OSError):
        return None


def _subscription_period_end_dt(sub: dict) -> datetime | None:
    """Read the paid-through date from legacy or item-level Stripe payloads."""
    direct = _current_period_end_dt(sub.get("current_period_end"))
    if direct is not None:
        return direct
    items = ((sub.get("items") or {}).get("data") or [])
    ends = [
        parsed
        for item in items
        if isinstance(item, dict)
        for parsed in [_current_period_end_dt(item.get("current_period_end"))]
        if parsed is not None
    ]
    return max(ends) if ends else None


def _invoice_period_end_dt(inv: dict) -> datetime | None:
    """Best-effort period end extraction from invoice line items."""
    lines = ((inv.get("lines") or {}).get("data") or [])
    if not lines:
        return None
    first_line = lines[0] if isinstance(lines[0], dict) else {}
    period = first_line.get("period") if isinstance(first_line, dict) else None
    if not isinstance(period, dict):
        return None
    return _current_period_end_dt(period.get("end"))


def _invoice_price_id(inv: dict) -> str | None:
    """Best-effort price id extraction from invoice line items."""
    lines = ((inv.get("lines") or {}).get("data") or [])
    if not lines:
        return None
    first_line = lines[0] if isinstance(lines[0], dict) else {}
    price_obj = first_line.get("price") if isinstance(first_line, dict) else None
    if isinstance(price_obj, dict):
        pid = price_obj.get("id")
        return str(pid) if pid else None
    return None


async def _sync_subscription_from_stripe_object(db: AsyncSession, sub: dict) -> None:
    """Sync internal subscription state from Stripe webhook object.

    This keeps Stripe as an external event source while internal records remain
    the entitlement authority.
    """
    customer_id = sub.get("customer")
    if isinstance(customer_id, dict):
        customer_id = customer_id.get("id")
    if not customer_id or not isinstance(customer_id, str):
        return

    user = await db.scalar(select(User).where(User.stripe_customer_id == customer_id).limit(1))
    if user is None:
        return

    items = ((sub.get("items") or {}).get("data") or [])
    first_item = items[0] if items else {}
    price_obj = first_item.get("price") if isinstance(first_item, dict) else {}
    if isinstance(price_obj, dict):
        price_id = price_obj.get("id")
    else:
        price_id = None

    plan_slug, tier, billing_interval = _plan_slug_and_tier_for_price_id(price_id)
    if plan_slug is None:
        # Keep current internal state if this subscription item is unknown.
        return

    plan = await db.scalar(select(Plan).where(Plan.slug == plan_slug).limit(1))
    if plan is None:
        return

    stripe_sub_id = sub.get("id")
    if not stripe_sub_id:
        return

    status_raw = str(sub.get("status") or "")
    cpe = _subscription_period_end_dt(sub)

    internal_sub = await db.scalar(
        select(UserSubscription).where(UserSubscription.stripe_subscription_id == str(stripe_sub_id)).limit(1)
    )
    if internal_sub is None:
        internal_sub = UserSubscription(
            user_id=user.id,
            plan_id=plan.id,
            stripe_subscription_id=str(stripe_sub_id),
            status=status_raw or "active",
            billing_interval=billing_interval,
            current_period_end=cpe,
        )
        db.add(internal_sub)
    else:
        internal_sub.user_id = user.id
        internal_sub.plan_id = plan.id
    internal_sub.status = status_raw or internal_sub.status
    internal_sub.billing_interval = billing_interval or internal_sub.billing_interval
    internal_sub.current_period_end = cpe
    internal_sub.stripe_price_id = str(price_id) if price_id else None
    if isinstance(price_obj, dict):
        internal_sub.unit_amount_cents = int(price_obj.get("unit_amount") or 0)
        recurring = price_obj.get("recurring") or {}
        if isinstance(recurring, dict):
            internal_sub.interval_count = int(recurring.get("interval_count") or 1)
        db.add(internal_sub)

    # Denormalized tier for legacy reads, while entitlement checks use internal_sub + plan.
    now = datetime.now(timezone.utc)
    prefs = dict(user.preferences or {})
    trial_meta = dict(prefs.get("trial") or {})

    if status_raw == "trialing":
        trial_meta.setdefault("started_at", now.isoformat())
        if cpe is not None:
            trial_meta["ends_at"] = cpe.isoformat()

    has_current_access = cpe is None or cpe > now
    if has_current_access and status_raw in {"active", "trialing", "past_due"}:
        user.subscription_tier = tier or user.subscription_tier
        if status_raw == "active" and trial_meta.get("started_at") and not trial_meta.get("used_at"):
            trial_meta["used_at"] = now.isoformat()
            trial_meta["converted_at"] = now.isoformat()
    elif status_raw in {"canceled", "unpaid", "incomplete_expired"} and (not cpe or cpe <= now):
        user.subscription_tier = "free"
        if status_raw in {"canceled", "incomplete_expired"} and trial_meta.get("started_at") and not trial_meta.get("used_at"):
            # Trial ended/canceled without conversion but should still count as used.
            trial_meta["used_at"] = now.isoformat()

    if trial_meta:
        prefs["trial"] = trial_meta
        user.preferences = prefs

    db.add(user)
    if isinstance(plan, Plan) and status_raw in {"active", "trialing"} and has_current_access:
        await credits_service.award_monthly_allowance_for_user(db, user.id, plan.id, period_end=cpe)


@router.get("/pricing", response_model=BillingPricingResponse)
async def billing_pricing() -> BillingPricingResponse:
    return BillingPricingResponse(
        default_interval=(settings.BILLING_DEFAULT_INTERVAL or BillingInterval.annual.value),
        plans=_pricing_plan_catalog(),
    )


@router.get("/entitlements/me", response_model=EntitlementsSnapshotResponse)
async def billing_entitlements_snapshot(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> EntitlementsSnapshotResponse:
    plan_slug = await entitlements_service._user_plan_slug(db, current_user)
    plan_features = await entitlements_service._plan_features(db, plan_slug)

    monthly_content, purchased = await credits_service._split_pool_balances(db, current_user.id, pool="content")
    monthly_regen, _ = await credits_service._split_pool_balances(db, current_user.id, pool="regen")

    latest_sub = await _latest_subscription_row(db, current_user.id)
    sub_status = latest_sub.status if latest_sub is not None else "free"
    interval = latest_sub.billing_interval if latest_sub is not None else None
    period_end = latest_sub.current_period_end if latest_sub is not None else None

    action_map: dict[str, EntitlementActionDecision] = {}
    action_inputs = [
        ("create_book", entitlements_service.Action.CREATE_BOOK, {}),
        ("create_flashcard_set", entitlements_service.Action.CREATE_SET, {}),
        ("games", entitlements_service.Action.START_GAME, {}),
        ("challenges", entitlements_service.Action.SEND_CHALLENGE, {}),
        ("study_group_creation", entitlements_service.Action.CREATE_STUDY_GROUP, {}),
        ("priority_processing", entitlements_service.Action.PRIORITY_PROCESSING, {}),
        ("daily_review", entitlements_service.Action.DAILY_REVIEW, {"count": int(plan_features.get("daily_review_limit") or 0)}),
        ("regeneration", entitlements_service.Action.REGENERATE, {}),
    ]
    for key, action, kwargs in action_inputs:
        d = await entitlements_service.can_user_do(db, current_user, action, **kwargs)
        action_map[key] = EntitlementActionDecision(
            allowed=bool(d.get("allowed")),
            reason=d.get("reason"),
            upgrade_hook=d.get("upgrade_hook"),
            consume=d.get("consume"),
        )

    features = EntitlementFeatures(
        create_book=bool(action_map["create_book"].allowed),
        create_flashcard_set=bool(action_map["create_flashcard_set"].allowed),
        games=bool(action_map["games"].allowed),
        games_limit=int(plan_features.get("games_limit") or 0),
        challenges=bool(action_map["challenges"].allowed),
        study_group_creation=bool(action_map["study_group_creation"].allowed),
        priority_processing=bool(action_map["priority_processing"].allowed),
        daily_review_limit=(int(plan_features.get("daily_review_limit")) if plan_features.get("daily_review_limit") is not None else None),
        regeneration=bool(action_map["regeneration"].allowed),
    )

    return EntitlementsSnapshotResponse(
        plan_slug=plan_slug,
        subscription_status=sub_status,
        billing_interval=interval,
        renewal_or_end_date=period_end,
        balances=EntitlementBalances(
            monthly_content_credits=monthly_content,
            purchased_credits=purchased,
            monthly_regen_credits=monthly_regen,
        ),
        features=features,
        actions=action_map,
        raw_plan_features=plan_features,
    )


@router.get("/overview")
async def billing_overview(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Aggregate authoritative subscription, allowance, and billing data."""
    now = datetime.now(timezone.utc)
    plan_slug = await entitlements_service._user_plan_slug(db, current_user)
    features = await entitlements_service._plan_features(db, plan_slug)
    subscription = await _latest_subscription_row(db, current_user.id)
    resolution = await _resolve_stripe_subscription(db, current_user)
    subscription_state = resolution["state"]
    if subscription_state == "subscription_conflict":
        subscription = None
    interval = subscription.billing_interval if subscription else None
    period_end = subscription.current_period_end if subscription else None
    paid = plan_slug != "free"
    usage_start = (subscription.created_at if subscription and subscription.created_at else (datetime(now.year, now.month, 1, tzinfo=timezone.utc) if paid else None))
    usage_reset = (period_end if period_end else ((datetime(now.year + (1 if now.month == 12 else 0), 1 if now.month == 12 else now.month + 1, 1, tzinfo=timezone.utc)) if paid else None))

    def usage_filters(model):
        filters = [model.user_id == current_user.id]
        if usage_start is not None:
            filters.append(model.created_at >= usage_start)
        return filters

    books_used = int(await db.scalar(select(func.count(Book.id)).where(*usage_filters(Book))) or 0)
    sets_used = int(await db.scalar(select(func.count(FlashcardSet.id)).where(*usage_filters(FlashcardSet))) or 0)
    monthly_content, purchased = await credits_service._split_pool_balances(db, current_user.id, pool="content")
    monthly_regen, purchased_regen = await credits_service._split_pool_balances(db, current_user.id, pool="regen")

    # If user has an active subscription but hasn't received their allowance grant for this cycle yet, grant it now
    if subscription and subscription.plan_id and subscription.status in ("active", "trialing") and monthly_content == 0:
        await credits_service.award_monthly_allowance_for_user(db, current_user.id, subscription.plan_id, period_end=period_end)
        await db.commit()
        monthly_content, purchased = await credits_service._split_pool_balances(db, current_user.id, pool="content")
        monthly_regen, purchased_regen = await credits_service._split_pool_balances(db, current_user.id, pool="regen")

    ledger_rows = (await db.execute(
        select(CreditLedger).where(CreditLedger.user_id == current_user.id)
        .order_by(CreditLedger.created_at.desc()).limit(200)
    )).scalars().all()

    pricing = _pricing_plan_catalog().get(plan_slug)
    amount_cents = 0
    if pricing:
        amount_cents = (
            pricing.annual_price_cents if interval == "annual" else pricing.monthly_price_cents
        ) or 0
    if subscription_state == "subscription_conflict":
        amount_cents = 0

    invoices = []
    payment_method = None
    if current_user.stripe_customer_id and settings.STRIPE_SECRET_KEY:
        stripe.api_key = settings.STRIPE_SECRET_KEY
        try:
            invoice_list, methods = await asyncio.gather(
                asyncio.to_thread(
                    stripe.Invoice.list,
                    customer=current_user.stripe_customer_id,
                    limit=10,
                ),
                asyncio.to_thread(
                    stripe.PaymentMethod.list,
                    customer=current_user.stripe_customer_id,
                    type="card",
                    limit=1,
                ),
            )
            for raw in getattr(invoice_list, "data", []) or []:
                inv = _stripe_object_as_dict(raw)
                invoices.append({
                    "id": inv.get("id"), "created_at": _current_period_end_dt(inv.get("created")),
                    "amount_cents": int(inv.get("amount_paid") or inv.get("amount_due") or 0),
                    "currency": str(inv.get("currency") or "usd"), "status": inv.get("status"),
                    "hosted_invoice_url": inv.get("hosted_invoice_url"), "invoice_pdf": inv.get("invoice_pdf"),
                    "period_start": _current_period_end_dt(inv.get("period_start")),
                    "period_end": _current_period_end_dt(inv.get("period_end")),
                })
            method_rows = getattr(methods, "data", []) or []
            if method_rows:
                method = _stripe_object_as_dict(method_rows[0])
                card = method.get("card") or {}
                payment_method = {"brand": card.get("brand"), "last4": card.get("last4"), "exp_month": card.get("exp_month"), "exp_year": card.get("exp_year")}
        except Exception:
            logger.warning("Stripe billing details unavailable for user %s", current_user.id, exc_info=True)

    return {
        "subscription": {
            "state": subscription_state, "conflict_count": resolution.get("count", 0),
            "plan_slug": None if subscription_state == "subscription_conflict" else plan_slug,
            "status": "subscription_conflict" if subscription_state == "subscription_conflict" else (subscription.status if subscription else "free"),
            "billing_interval": interval, "amount_cents": amount_cents, "currency": "usd",
            "current_period_start": subscription.created_at if subscription else None,
            "current_period_end": period_end, "usage_period_start": usage_start,
            "usage_resets_at": usage_reset, "cancel_at_period_end": bool(subscription and subscription.status == "canceled"),
        },
        "usage": [
            {"key": "books", "used": books_used, "limit": features.get("max_books"), "resets_at": usage_reset},
            {"key": "flashcard_sets", "used": sets_used, "limit": features.get("max_sets"), "resets_at": usage_reset},
        ],
        "limits": {
            "cards_per_set": features.get("max_cards_per_set"), "games": features.get("games_limit"),
            "game_scenarios": 5, "challenges": bool(features.get("can_send_challenges")),
            "study_groups": "create_and_run" if features.get("can_create_study_group") else "join_only",
            "regeneration": "included" if plan_slug == "premium_30" else ("extra_credits" if plan_slug == "standard_15" else "not_included"),
            "daily_review": "unlimited" if features.get("daily_review_limit") is None else features.get("daily_review_limit"),
        },
        "credits": {"monthly_content": monthly_content, "purchased": purchased, "monthly_regeneration": monthly_regen, "purchased_regeneration": purchased_regen},
        "credit_policy": {
            "authoritative_timezone": "UTC", "consumption_priority": ["monthly_allowance", "purchased"],
            "content": {"eligible_actions": ["create_book", "create_set"], "requires_feature_allowance": True, "monthly_expires_at": usage_reset},
            "regeneration": {"eligible_actions": ["regeneration"], "requires_feature_entitlement": True},
            "purchased": {"expires_at": period_end, "rolls_over": False},
        },
        "activity": [{"id": str(row.id), "amount": row.amount, "pool": row.pool, "reason": row.reason, "metadata": row.meta, "expires_at": row.expires_at, "created_at": row.created_at} for row in ledger_rows],
        "invoices": invoices, "payment_method": payment_method,
    }


@router.post("/customer-portal")
async def create_customer_portal(
    current_user: Annotated[User, Depends(get_current_user)],
) -> CheckoutUrlResponse:
    if not current_user.stripe_customer_id:
        raise _billing_error(status.HTTP_404_NOT_FOUND, "NO_BILLING_PROFILE", "No billing profile is available for this account.")
    if not settings.STRIPE_SECRET_KEY:
        raise _billing_error(status.HTTP_503_SERVICE_UNAVAILABLE, "BILLING_UNAVAILABLE", "Billing services are temporarily unavailable.")
    stripe.api_key = settings.STRIPE_SECRET_KEY
    try:
        session = stripe.billing_portal.Session.create(
            customer=current_user.stripe_customer_id,
            return_url=f"{settings.FRONTEND_URL.rstrip('/')}/billing",
        )
    except Exception as exc:
        logger.warning("stripe_portal_create_failed", extra={"user_id": str(current_user.id), "error_type": type(exc).__name__})
        raise _billing_error(status.HTTP_503_SERVICE_UNAVAILABLE, "PORTAL_UNAVAILABLE", "Subscription management is temporarily unavailable.") from None
    if not session.url:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Stripe did not return a portal URL")
    return CheckoutUrlResponse(checkout_url=session.url)


@router.get("/trial/eligibility", response_model=TrialEligibilityResponse)
async def trial_eligibility(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TrialEligibilityResponse:
    trial_days = int(settings.TRIAL_DAYS_PREMIUM)
    if not settings.TRIAL_ENABLED:
        return TrialEligibilityResponse(eligible=False, reason="trial_disabled", signals={"trial_enabled": False}, trial_days=trial_days)

    signals = await _trial_eligibility_signals(db, current_user)
    if current_user.subscription_tier != "free":
        return TrialEligibilityResponse(eligible=False, reason="already_paid", signals=signals, trial_days=trial_days)
    if signals["trial_used"]:
        return TrialEligibilityResponse(eligible=False, reason="trial_already_used", signals=signals, trial_days=trial_days)
    if signals["has_prior_subscription"]:
        return TrialEligibilityResponse(eligible=False, reason="subscription_history", signals=signals, trial_days=trial_days)
    if signals["has_credit_purchase_history"]:
        return TrialEligibilityResponse(eligible=False, reason="payment_history", signals=signals, trial_days=trial_days)
    return TrialEligibilityResponse(eligible=True, reason=None, signals=signals, trial_days=trial_days)


@router.post("/trial/start", response_model=CheckoutUrlResponse)
async def start_trial_checkout(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    client: Annotated[CheckoutClient, Query(description="Client platform ('web' or 'mobile')")] = CheckoutClient.web,
) -> CheckoutUrlResponse:
    trial_check = await trial_eligibility(current_user=current_user, db=db)
    if not trial_check.eligible:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "TRIAL_NOT_ELIGIBLE",
                "reason": trial_check.reason,
                "signals": trial_check.signals,
            },
        )

    price_id = getattr(settings, "STRIPE_PRICE_ID_PREMIUM_MONTHLY", "") or settings.STRIPE_PRICE_ID_PREMIUM
    if not settings.STRIPE_SECRET_KEY or not price_id:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Stripe billing is not configured")

    stripe.api_key = settings.STRIPE_SECRET_KEY
    r = await db.execute(select(User).where(User.id == current_user.id).with_for_update())
    user_row = r.scalar_one()
    if not user_row.stripe_customer_id:
        customer = stripe.Customer.create(
            email=user_row.email,
            metadata={"user_id": str(user_row.id)},
            idempotency_key=f"mindflip:user:{user_row.id}:customer",
        )
        user_row.stripe_customer_id = customer.id
        await db.commit()
        await db.refresh(user_row)

    resolution = await _resolve_stripe_subscription(db, user_row)
    if resolution["state"] == "subscription_conflict":
        raise _billing_error(status.HTTP_409_CONFLICT, "SUBSCRIPTION_CONFLICT", "Multiple active subscriptions require support review before initiating trial checkout.")
    if resolution["state"] == "active":
        raise _billing_error(status.HTTP_409_CONFLICT, "ALREADY_SUBSCRIBED", "An active subscription already exists. Manage it from Billing & Usage.")

    if client == CheckoutClient.mobile:
        base_success = settings.MOBILE_CHECKOUT_SUCCESS_URL
        base_cancel = settings.MOBILE_CHECKOUT_CANCEL_URL
    else:
        base_web = settings.FRONTEND_URL.rstrip("/")
        base_success = f"{base_web}/billing/success"
        base_cancel = f"{base_web}/billing/cancel"

    if "?" in base_success:
        success_url = f"{base_success}&session_id={{CHECKOUT_SESSION_ID}}"
    else:
        success_url = f"{base_success}?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = base_cancel

    session = stripe.checkout.Session.create(
        customer=user_row.stripe_customer_id,
        mode="subscription",
        line_items=[{"price": price_id, "quantity": 1}],
        success_url=success_url,
        cancel_url=cancel_url,
        client_reference_id=str(user_row.id),
        metadata={
            "user_id": str(user_row.id),
            "plan": BillingPlan.premium.value,
            "plan_slug": "premium_30",
            "interval": BillingInterval.monthly.value,
            "is_trial": "true",
        },
        subscription_data={
            "trial_period_days": int(settings.TRIAL_DAYS_PREMIUM),
            "metadata": {"is_trial": "true", "user_id": str(user_row.id)},
        },
        payment_method_collection="always",
        idempotency_key=f"mindflip:trial_checkout:{user_row.id}:{uuid.uuid4().hex}",
    )
    url = session.url
    if not url:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Stripe did not return a checkout URL")

    prefs = dict(user_row.preferences or {})
    trial_meta = dict(prefs.get("trial") or {})
    trial_meta["started_checkout_at"] = datetime.now(timezone.utc).isoformat()
    prefs["trial"] = trial_meta
    user_row.preferences = prefs
    await db.commit()

    return CheckoutUrlResponse(checkout_url=url)


@router.post("/subscription/cancel", response_model=SubscriptionCancelResponse)
async def cancel_subscription_at_period_end(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SubscriptionCancelResponse:
    resolution = await _resolve_stripe_subscription(db, current_user)
    if resolution["state"] == "subscription_conflict":
        raise _billing_error(status.HTTP_409_CONFLICT, "SUBSCRIPTION_CONFLICT", "Multiple active subscriptions require support review.")
    resolved = resolution.get("subscription") or {}
    resolved_id = resolved.get("id")
    latest_sub = await db.scalar(select(UserSubscription).where(
        UserSubscription.user_id == current_user.id,
        UserSubscription.stripe_subscription_id == str(resolved_id),
    )) if resolved_id else None
    if latest_sub is None or not latest_sub.stripe_subscription_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No active subscription found")

    if not settings.STRIPE_SECRET_KEY:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Stripe billing is not configured")

    stripe.api_key = settings.STRIPE_SECRET_KEY
    stripe.Subscription.modify(
        latest_sub.stripe_subscription_id,
        cancel_at_period_end=True,
    )

    latest_sub.status = "canceled"
    db.add(latest_sub)
    await db.commit()

    return SubscriptionCancelResponse(
        canceled_at_period_end=True,
        current_period_end=latest_sub.current_period_end,
    )


@router.post("/subscription/sync")
async def sync_subscription_from_stripe(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Recover subscription state when a Stripe webhook was delayed or missed."""
    resolution = await _resolve_stripe_subscription(db, current_user)
    if resolution["state"] == "subscription_conflict":
        return {"synced": False, "state": "subscription_conflict"}
    subscription = resolution.get("subscription")
    if not subscription:
        return {"synced": False, "state": "none"}
    await _sync_subscription_from_stripe_object(db, subscription)
    await db.commit()
    return {"synced": True, "state": "active"}


# Redis: dedupe Stripe webhook deliveries (at-least-once). TTL >> Stripe retry window.
_STRIPE_EVENT_DEDUPE_PREFIX = "billing:stripe:event:"
_STRIPE_EVENT_DEDUPE_TTL_SEC = 30 * 24 * 3600  # 30 days


def _event_type(event: object) -> str | None:
    if isinstance(event, dict):
        return event.get("type")
    return getattr(event, "type", None)


def _event_id(event: object) -> str | None:
    if isinstance(event, dict):
        eid = event.get("id")
        return str(eid) if eid else None
    eid = getattr(event, "id", None)
    return str(eid) if eid else None


def _event_data_object(event: object) -> dict:
    """Normalize Stripe ``Event.data.object`` to a plain ``dict`` (SDK returns ``StripeObject``)."""
    if isinstance(event, dict):
        data = event.get("data") or {}
        obj = data.get("object")
        return _stripe_object_as_dict(obj)
    data = getattr(event, "data", None)
    if data is None:
        return {}
    obj = getattr(data, "object", None)
    return _stripe_object_as_dict(obj)


def _stripe_object_as_dict(obj: object) -> dict:
    if obj is None:
        return {}
    if isinstance(obj, dict):
        return obj
    fn = (
        getattr(obj, "to_dict_recursive", None)
        or getattr(obj, "_to_dict_recursive", None)
        or getattr(obj, "to_dict", None)
    )
    if callable(fn):
        out = fn()
        return out if isinstance(out, dict) else {}
    return {}


_VALID_SUBSCRIPTION_STATUSES = {"active", "trialing", "past_due"}


def _billing_error(status_code: int, code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status_code, detail={"code": code, "message": message})


async def _resolve_stripe_subscription(db: AsyncSession, user: User) -> dict:
    """Resolve one Stripe subscription without guessing across conflicts."""
    local_rows = (await db.execute(
        select(UserSubscription).where(
            UserSubscription.user_id == user.id,
            UserSubscription.stripe_subscription_id.is_not(None),
            UserSubscription.status.in_(tuple(_VALID_SUBSCRIPTION_STATUSES)),
        )
    )).scalars().all()
    local_ids = {str(row.stripe_subscription_id) for row in local_rows if row.stripe_subscription_id}
    if len(local_ids) > 1:
        logger.error("billing_subscription_conflict", extra={"user_id": str(user.id), "local_subscription_count": len(local_ids)})
        return {"state": "subscription_conflict", "subscription": None, "count": len(local_ids)}
    if not user.stripe_customer_id:
        return {"state": "none", "subscription": None, "count": 0}
    if not settings.STRIPE_SECRET_KEY:
        raise _billing_error(status.HTTP_503_SERVICE_UNAVAILABLE, "BILLING_UNAVAILABLE", "Billing services are temporarily unavailable.")
    stripe.api_key = settings.STRIPE_SECRET_KEY
    try:
        result = await asyncio.to_thread(
            stripe.Subscription.list, customer=user.stripe_customer_id, status="all", limit=10,
        )
    except Exception as exc:
        logger.warning("stripe_subscription_lookup_failed", extra={"user_id": str(user.id), "error_type": type(exc).__name__})
        raise _billing_error(status.HTTP_503_SERVICE_UNAVAILABLE, "STRIPE_UNAVAILABLE", "Billing services are temporarily unavailable.") from None
    rows = [_stripe_object_as_dict(item) for item in (getattr(result, "data", None) or [])]
    valid = [row for row in rows if row.get("status") in _VALID_SUBSCRIPTION_STATUSES]
    if len(local_ids) == 1:
        local_id = next(iter(local_ids))
        match = next((row for row in valid if str(row.get("id")) == local_id), None)
        if match:
            return {"state": "active", "subscription": match, "count": len(valid)}
    if not local_ids and len(valid) == 1:
        return {"state": "active", "subscription": valid[0], "count": 1}
    if len(valid) > 1:
        logger.error("billing_subscription_conflict", extra={"user_id": str(user.id), "stripe_subscription_count": len(valid)})
        return {"state": "subscription_conflict", "subscription": None, "count": len(valid)}
    return {"state": "none", "subscription": None, "count": 0}


@router.post("/checkout", response_model=CheckoutUrlResponse)
async def create_checkout_session(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    plan: Annotated[BillingPlan, Query(description="Subscription plan to purchase")] = BillingPlan.standard,
    interval: Annotated[BillingInterval, Query(description="Billing interval")] = BillingInterval.annual,
    client: Annotated[CheckoutClient, Query(description="Client platform ('web' or 'mobile')")] = CheckoutClient.web,
) -> CheckoutUrlResponse:
    """Requires a valid Bearer access token (``HTTPBearer`` on ``get_current_user``)."""
    price_id = _price_id_for_plan(plan, interval)
    if not settings.STRIPE_SECRET_KEY or not price_id:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Stripe billing is not configured",
        )
    stripe.api_key = settings.STRIPE_SECRET_KEY

    # Serialize customer creation: row lock + Stripe idempotency key avoids duplicate Customers.
    r = await db.execute(select(User).where(User.id == current_user.id).with_for_update())
    user_row = r.scalar_one()
    if not user_row.stripe_customer_id:
        customer = stripe.Customer.create(
            email=user_row.email,
            metadata={"user_id": str(user_row.id)},
            idempotency_key=f"mindflip:user:{user_row.id}:customer",
        )
        user_row.stripe_customer_id = customer.id
        await db.commit()
        await db.refresh(user_row)

    resolution = await _resolve_stripe_subscription(db, user_row)
    if resolution["state"] == "subscription_conflict":
        raise _billing_error(status.HTTP_409_CONFLICT, "SUBSCRIPTION_CONFLICT", "Multiple active subscriptions require support review before another checkout.")
    if resolution["state"] == "active":
        raise _billing_error(status.HTTP_409_CONFLICT, "ALREADY_SUBSCRIBED", "An active subscription already exists. Manage it from Billing & Usage.")

    if client == CheckoutClient.mobile:
        base_success = settings.MOBILE_CHECKOUT_SUCCESS_URL
        base_cancel = settings.MOBILE_CHECKOUT_CANCEL_URL
    else:
        base_web = settings.FRONTEND_URL.rstrip("/")
        base_success = f"{base_web}/billing/success"
        base_cancel = f"{base_web}/billing/cancel"

    if "?" in base_success:
        success_url = f"{base_success}&session_id={{CHECKOUT_SESSION_ID}}"
    else:
        success_url = f"{base_success}?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = base_cancel

    try:
        session = stripe.checkout.Session.create(
            customer=user_row.stripe_customer_id,
            mode="subscription",
            line_items=[{"price": price_id, "quantity": 1}],
            success_url=success_url,
            cancel_url=cancel_url,
            client_reference_id=str(user_row.id),
            metadata={
                "user_id": str(user_row.id), "plan": plan.value,
                "plan_slug": _plan_slug_for_metadata(plan.value), "interval": interval.value,
            },
            idempotency_key=f"mindflip:checkout_session:{user_row.id}:{plan.value}:{interval.value}:{int(datetime.now(timezone.utc).timestamp() // 600)}",
        )
    except Exception as exc:
        logger.warning("stripe_checkout_create_failed", extra={"user_id": str(user_row.id), "error_type": type(exc).__name__})
        raise _billing_error(status.HTTP_503_SERVICE_UNAVAILABLE, "CHECKOUT_UNAVAILABLE", "Checkout is temporarily unavailable.") from None
    url = session.url
    if not url:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Stripe did not return a checkout URL",
        )
    return CheckoutUrlResponse(checkout_url=url)


@router.get("/checkout/sessions/{session_id}", response_model=CheckoutVerificationResponse)
async def verify_checkout_session(
    session_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CheckoutVerificationResponse:
    """Verify a Stripe Checkout session's completion status and ownership for mobile return."""
    if not session_id or not session_id.startswith("cs_"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid Checkout session ID format",
        )

    if not settings.STRIPE_SECRET_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Stripe billing is not configured",
        )
    stripe.api_key = settings.STRIPE_SECRET_KEY

    try:
        session = stripe.checkout.Session.retrieve(session_id)
    except stripe.error.InvalidRequestError as err:
        logger.info("stripe_checkout_retrieve_invalid_request", extra={"session_id": session_id, "error": str(err)})
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Checkout session not found",
        )
    except (stripe.error.AuthenticationError, stripe.error.PermissionError) as err:
        logger.error("stripe_checkout_auth_error", extra={"session_id": session_id, "error": str(err)})
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Stripe billing configuration error",
        )
    except (stripe.error.APIConnectionError, stripe.error.RateLimitError, stripe.error.StripeError) as err:
        logger.warning("stripe_checkout_transient_error", extra={"session_id": session_id, "error": str(err)})
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Checkout verification service temporarily unavailable",
        )
    except Exception:
        logger.warning("stripe_checkout_unknown_error", extra={"session_id": session_id})
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Checkout session not found",
        )

    # Ownership checks (strict policy matching section 1 & 2)
    client_ref = session.get("client_reference_id") if isinstance(session, dict) else getattr(session, "client_reference_id", None)
    meta = (session.get("metadata") if isinstance(session, dict) else getattr(session, "metadata", None)) or {}
    meta_user_id = (meta.get("user_id") if isinstance(meta, dict) else getattr(meta, "user_id", None)) if meta else None

    user_id_str = str(current_user.id)
    client_ref_str = str(client_ref) if client_ref is not None else None
    meta_user_id_str = str(meta_user_id) if meta_user_id is not None else None

    client_ref_present = bool(client_ref_str)
    meta_user_id_present = bool(meta_user_id_str)

    if not client_ref_present and not meta_user_id_present:
        logger.warning("checkout_session_ownership_missing", extra={"session_id": session_id, "user_id": user_id_str})
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Checkout session missing user ownership metadata",
        )

    if client_ref_present and meta_user_id_present:
        if client_ref_str != user_id_str or meta_user_id_str != user_id_str:
            logger.warning(
                "checkout_session_ownership_mismatch",
                extra={"session_id": session_id, "user_id": user_id_str, "client_ref": client_ref_str, "meta_user_id": meta_user_id_str},
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Checkout session ownership mismatch",
            )
    elif client_ref_present and not meta_user_id_present:
        # Legacy session compatibility: only client_reference_id present
        if client_ref_str != user_id_str:
            logger.warning("checkout_session_client_ref_mismatch", extra={"session_id": session_id, "user_id": user_id_str, "client_ref": client_ref_str})
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Checkout session ownership mismatch",
            )
    elif not client_ref_present and meta_user_id_present:
        # Legacy session compatibility: only metadata user_id present
        if meta_user_id_str != user_id_str:
            logger.warning("checkout_session_meta_user_mismatch", extra={"session_id": session_id, "user_id": user_id_str, "meta_user_id": meta_user_id_str})
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Checkout session ownership mismatch",
            )

    # Customer ID consistency check (Section 2)
    session_customer = session.get("customer") if isinstance(session, dict) else getattr(session, "customer", None)
    if session_customer and current_user.stripe_customer_id:
        if str(session_customer) != str(current_user.stripe_customer_id):
            logger.warning(
                "checkout_session_customer_mismatch",
                extra={"session_id": session_id, "user_id": user_id_str, "known_customer": current_user.stripe_customer_id, "session_customer": session_customer},
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Checkout session customer mismatch",
            )

    raw_status = str(session.get("status") or "open")
    checkout_status = "complete" if raw_status == "complete" else "expired" if raw_status == "expired" else "open"

    resolution = await _resolve_stripe_subscription(db, current_user)
    if resolution["state"] == "subscription_conflict":
        sub_state = "conflict"
    elif resolution["state"] == "active":
        sub_state = "active"
    elif checkout_status == "complete":
        sub_state = "processing"
    else:
        sub_state = "not_confirmed"

    plan_slug = meta.get("plan_slug") if isinstance(meta, dict) else None
    interval = meta.get("interval") if isinstance(meta, dict) else None

    return CheckoutVerificationResponse(
        session_id=session_id,
        checkout_status=checkout_status,
        subscription_state=sub_state,
        plan_slug=str(plan_slug) if plan_slug else None,
        interval=str(interval) if interval else None,
    )


@router.post("/checkout/credits", response_model=CheckoutUrlResponse)
async def create_credit_checkout_session(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    quantity: Annotated[int, Query(ge=1, le=_CREDIT_MAX_QUANTITY, description="Number of credits to purchase")],
) -> CheckoutUrlResponse:
    """Create a one-time Stripe Checkout session for quantity-based credit purchase.

    Requires a valid Bearer access token (``HTTPBearer`` on ``get_current_user``).
    """
    if not settings.STRIPE_SECRET_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Stripe billing is not configured",
        )
    stripe.api_key = settings.STRIPE_SECRET_KEY

    # Serialize customer creation: row lock + Stripe idempotency key avoids duplicate Customers.
    r = await db.execute(select(User).where(User.id == current_user.id).with_for_update())
    user_row = r.scalar_one()
    if not user_row.stripe_customer_id:
        customer = stripe.Customer.create(
            email=user_row.email,
            metadata={"user_id": str(user_row.id)},
            idempotency_key=f"mindflip:user:{user_row.id}:customer",
        )
        user_row.stripe_customer_id = customer.id
        await db.commit()
        await db.refresh(user_row)

    base = settings.FRONTEND_URL.rstrip("/")
    unit_price_cents = _credit_unit_price_cents()
    session = stripe.checkout.Session.create(
        customer=user_row.stripe_customer_id,
        mode="payment",
        line_items=[_credit_checkout_line_item(quantity)],
        success_url=f"{base}/billing/credits/success",
        cancel_url=f"{base}/billing/credits/cancel",
        client_reference_id=str(user_row.id),
        metadata={
            "user_id": str(user_row.id),
            "credit_quantity": str(quantity),
            "unit_price_cents": str(unit_price_cents),
            "currency": _credit_currency(),
        },
        idempotency_key=f"mindflip:credits_checkout:{user_row.id}:{uuid.uuid4().hex}",
    )
    url = session.url
    if not url:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Stripe did not return a checkout URL",
        )
    return CheckoutUrlResponse(checkout_url=url)


@router.post("/webhook")
async def stripe_webhook(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    redis: Annotated[Redis, Depends(get_redis)],
) -> dict[str, bool]:
    if not settings.STRIPE_WEBHOOK_SECRET:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Webhook not configured")

    # Must pass exact raw body bytes to Stripe — never parse JSON first (breaks signature).
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")
    if not sig_header:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing stripe-signature")

    try:
        event = stripe.Webhook.construct_event(
            payload,
            sig_header,
            settings.STRIPE_WEBHOOK_SECRET,
        )
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid payload") from None
    except stripe.SignatureVerificationError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid signature") from None

    # Replay safety: first successful verification wins; duplicates short-circuit (no DB side effects).
    event_id = _event_id(event)
    if event_id:
        dedupe_key = _STRIPE_EVENT_DEDUPE_PREFIX + event_id
        try:
            was_set = await redis.set(dedupe_key, "1", nx=True, ex=_STRIPE_EVENT_DEDUPE_TTL_SEC)
        except Exception:
            was_set = True
        if not was_set:
            return {"received": True}

    etype = _event_type(event)
    data_object = _event_data_object(event)
    if event_id:
        await db.execute(
            pg_insert(BillingEvent).values(
                stripe_event_id=event_id, event_type=etype or "unknown", status="succeeded",
                payload=data_object, processed_at=datetime.now(timezone.utc),
            ).on_conflict_do_nothing(index_elements=[BillingEvent.stripe_event_id])
        )

    if etype == "checkout.session.completed":
        session = data_object
        if session.get("mode") == "subscription":
            meta = session.get("metadata") or {}
            uid_str = meta.get("user_id") if isinstance(meta, dict) else None
            if not uid_str:
                cref = session.get("client_reference_id")
                if cref:
                    uid_str = str(cref)
            customer_id = session.get("customer")
            if isinstance(customer_id, dict):
                customer_id = customer_id.get("id")
            if uid_str:
                try:
                    uid = UUID(str(uid_str))
                except ValueError:
                    uid = None
                if uid is not None:
                    ur = await db.execute(select(User).where(User.id == uid))
                    user = ur.scalar_one_or_none()
                    if user is not None:
                        if customer_id and isinstance(customer_id, str) and not user.stripe_customer_id:
                            user.stripe_customer_id = customer_id
                        plan = meta.get("plan") if isinstance(meta, dict) else None
                        user.subscription_tier = _subscription_tier_for_plan(str(plan) if plan else None)
                        # Lightweight sync from checkout metadata; canonical plan assignment is
                        # finalized by customer.subscription.created/updated events.
                        sub_id = session.get("subscription")
                        if isinstance(sub_id, dict):
                            sub_id = sub_id.get("id")
                        if isinstance(sub_id, str):
                            plan_slug = (
                                str(meta.get("plan_slug"))
                                if isinstance(meta, dict) and meta.get("plan_slug")
                                else _plan_slug_for_metadata(str(plan) if plan else None)
                            )
                            plan_row = await db.scalar(select(Plan).where(Plan.slug == plan_slug).limit(1))
                            if plan_row is not None:
                                existing_sub = await db.scalar(
                                    select(UserSubscription)
                                    .where(UserSubscription.stripe_subscription_id == sub_id)
                                    .limit(1)
                                )
                                if existing_sub is None:
                                    sub_record = UserSubscription(
                                        user_id=user.id,
                                        plan_id=plan_row.id,
                                        stripe_subscription_id=sub_id,
                                        status="active",
                                        billing_interval=(str(meta.get("interval")) if isinstance(meta, dict) and meta.get("interval") else None),
                                    )
                                    db.add(sub_record)
                                    await credits_service.award_monthly_allowance_for_user(db, user.id, plan_row.id)
                        await db.commit()
        elif session.get("mode") == "payment":
            # One-time credit purchase
            meta = session.get("metadata") or {}
            payment_status = str(session.get("payment_status") or "").lower()
            uid_str = meta.get("user_id") if isinstance(meta, dict) else None
            if not uid_str:
                cref = session.get("client_reference_id")
                if cref:
                    uid_str = str(cref)
            session_id = session.get("id")
            customer_id = session.get("customer")
            if isinstance(customer_id, dict):
                customer_id = customer_id.get("id")
            if uid_str:
                try:
                    uid = UUID(str(uid_str))
                except ValueError:
                    uid = None
                if uid is not None:
                    ur = await db.execute(select(User).where(User.id == uid))
                    user = ur.scalar_one_or_none()
                    if user is not None:
                        if customer_id and isinstance(customer_id, str) and not user.stripe_customer_id:
                            user.stripe_customer_id = customer_id

                        # DB-level idempotency for webhook processing (defensive even with Redis dedupe).
                        if session_id:
                            existing_purchase = await db.scalar(
                                select(CreditPurchase).where(CreditPurchase.stripe_session_id == str(session_id)).limit(1)
                            )
                            if existing_purchase is not None:
                                await db.commit()
                                return {"received": True}

                        quantity_raw = meta.get("credit_quantity") if isinstance(meta, dict) else None
                        try:
                            quantity = int(quantity_raw) if quantity_raw is not None else 0
                        except (TypeError, ValueError):
                            quantity = 0

                        if quantity > 0 and payment_status == "paid":
                            # Award one-time purchased credits to shared purchased pool.
                            # Expiry is tied to the user's current paid subscription period.
                            await credits_service.award_onetime_credits_for_user(db, uid, quantity)

                            payment_intent_id = session.get("payment_intent")
                            if isinstance(payment_intent_id, dict):
                                payment_intent_id = payment_intent_id.get("id")

                            unit_price_raw = meta.get("unit_price_cents") if isinstance(meta, dict) else None
                            try:
                                unit_price_cents = int(unit_price_raw) if unit_price_raw is not None else _credit_unit_price_cents()
                            except (TypeError, ValueError):
                                unit_price_cents = _credit_unit_price_cents()

                            amount_total = session.get("amount_total")
                            try:
                                amount_paid_cents = int(amount_total) if amount_total is not None else quantity * unit_price_cents
                            except (TypeError, ValueError):
                                amount_paid_cents = quantity * unit_price_cents

                            invoice_id = session.get("invoice")
                            if isinstance(invoice_id, dict):
                                invoice_id = invoice_id.get("id")

                            currency = session.get("currency") or (meta.get("currency") if isinstance(meta, dict) else None) or _credit_currency()

                            purchase = CreditPurchase(
                                user_id=uid,
                                quantity=quantity,
                                amount_paid_cents=amount_paid_cents,
                                currency=str(currency).lower(),
                                unit_price_cents=unit_price_cents,
                                stripe_event_id=event_id,
                                stripe_session_id=session_id,
                                stripe_payment_intent_id=payment_intent_id,
                                stripe_customer_id=str(customer_id) if isinstance(customer_id, str) else None,
                                stripe_invoice_id=str(invoice_id) if invoice_id else None,
                                status="completed",
                            )
                            db.add(purchase)
                            await db.flush()

                            # Upsell trigger after the 2nd successful purchase in the same UTC calendar month.
                            now_utc = datetime.now(timezone.utc)
                            monthly_purchase_count = await _monthly_successful_purchase_count(db, uid, now_utc)
                            if monthly_purchase_count == 2:
                                from tasks.email_tasks import send_second_purchase_upsell_task

                                send_second_purchase_upsell_task.delay(
                                    user_id=str(uid),
                                    full_name=user.full_name,
                                    email=user.email,
                                )

                            await db.commit()
                        elif quantity > 0:
                            amount_total = session.get("amount_total")
                            try:
                                amount_paid_cents = int(amount_total) if amount_total is not None else quantity * _credit_unit_price_cents()
                            except (TypeError, ValueError):
                                amount_paid_cents = quantity * _credit_unit_price_cents()
                            invoice_id = session.get("invoice")
                            if isinstance(invoice_id, dict):
                                invoice_id = invoice_id.get("id")
                            failed_purchase = CreditPurchase(
                                user_id=uid,
                                quantity=quantity,
                                amount_paid_cents=amount_paid_cents,
                                currency=str(session.get("currency") or _credit_currency()).lower(),
                                unit_price_cents=_credit_unit_price_cents(),
                                stripe_event_id=event_id,
                                stripe_session_id=session_id,
                                stripe_payment_intent_id=(session.get("payment_intent") if isinstance(session.get("payment_intent"), str) else None),
                                stripe_customer_id=str(customer_id) if isinstance(customer_id, str) else None,
                                stripe_invoice_id=str(invoice_id) if invoice_id else None,
                                status="failed",
                                notes=f"checkout.session.completed with payment_status={payment_status or 'unknown'}",
                            )
                            db.add(failed_purchase)
                            await db.commit()

    elif etype in {
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.resumed",
        "customer.subscription.paused",
    }:
        sub = data_object
        await _sync_subscription_from_stripe_object(db, sub)
        await db.commit()

    elif etype == "customer.subscription.deleted":
        sub = data_object
        await _sync_subscription_from_stripe_object(db, sub)
        # keep paid-through access until current period end (handled by entitlement resolver)
        await db.commit()

    elif etype == "invoice.payment_failed":
        inv = data_object
        sub_id = inv.get("subscription")
        if isinstance(sub_id, dict):
            sub_id = sub_id.get("id")
        if isinstance(sub_id, str):
            internal_sub = await db.scalar(
                select(UserSubscription)
                .where(UserSubscription.stripe_subscription_id == sub_id)
                .limit(1)
            )
            if internal_sub is not None:
                internal_sub.status = "past_due"
                db.add(internal_sub)
                await db.commit()

    elif etype == "invoice.payment_succeeded":
        inv = data_object
        from services.stripe_reconciliation import _invoice_payment_intent, _invoice_price_id, _invoice_subscription_id
        sub_id = _invoice_subscription_id(inv)
        if isinstance(sub_id, str):
            customer_id = inv.get("customer")
            if isinstance(customer_id, dict):
                customer_id = customer_id.get("id")

            internal_sub = await db.scalar(
                select(UserSubscription)
                .where(UserSubscription.stripe_subscription_id == sub_id)
                .limit(1)
            )

            # Recover from missing linkage by customer id + plan from invoice line.
            if internal_sub is None and isinstance(customer_id, str):
                user = await db.scalar(select(User).where(User.stripe_customer_id == customer_id).limit(1))
                price_id = _invoice_price_id(inv)
                plan_slug, _tier, interval = _plan_slug_and_tier_for_price_id(price_id)
                if user is not None and plan_slug:
                    plan = await db.scalar(select(Plan).where(Plan.slug == plan_slug).limit(1))
                    if plan is not None:
                        internal_sub = UserSubscription(
                            user_id=user.id,
                            plan_id=plan.id,
                            stripe_subscription_id=sub_id,
                            status="active",
                            billing_interval=interval,
                            current_period_end=_invoice_period_end_dt(inv),
                        )
                        db.add(internal_sub)

            if internal_sub is not None:
                internal_sub.status = "active"
                maybe_period_end = _invoice_period_end_dt(inv)
                if maybe_period_end is not None:
                    internal_sub.current_period_end = maybe_period_end
                db.add(internal_sub)
                u_id = getattr(internal_sub, "user_id", None)
                p_id = getattr(internal_sub, "plan_id", None)
                if isinstance(u_id, UUID) and isinstance(p_id, UUID):
                    await credits_service.award_monthly_allowance_for_user(db, u_id, p_id)
                await db.commit()

        customer_id = inv.get("customer")
        if isinstance(customer_id, dict):
            customer_id = customer_id.get("id")
        invoice_id = inv.get("id")
        if isinstance(customer_id, str) and invoice_id:
            invoice_user = await db.scalar(select(User).where(User.stripe_customer_id == customer_id).limit(1))
            if invoice_user is not None:
                invoice_row = await db.scalar(select(BillingInvoice).where(BillingInvoice.stripe_invoice_id == str(invoice_id)).limit(1))
                if invoice_row is None:
                    invoice_row = BillingInvoice(stripe_invoice_id=str(invoice_id), user_id=invoice_user.id,
                                                 stripe_customer_id=customer_id, status=str(inv.get("status") or "paid"))
                    db.add(invoice_row)
                transitions = inv.get("status_transitions") or {}
                price_id = _invoice_price_id(inv)
                plan_slug, _tier, _interval = _plan_slug_and_tier_for_price_id(price_id)
                invoice_row.stripe_subscription_id = sub_id
                invoice_row.stripe_payment_intent_id = _invoice_payment_intent(inv)
                invoice_row.plan_slug = plan_slug
                invoice_row.status = str(inv.get("status") or "paid")
                invoice_row.currency = str(inv.get("currency") or "usd")
                invoice_row.amount_due_cents = int(inv.get("amount_due") or 0)
                invoice_row.amount_paid_cents = int(inv.get("amount_paid") or 0)
                invoice_row.amount_refunded_cents = int(inv.get("amount_refunded") or 0)
                invoice_row.paid_at = _current_period_end_dt(transitions.get("paid_at") or inv.get("created"))
                invoice_row.period_start = _current_period_end_dt(inv.get("period_start"))
                invoice_row.period_end = _current_period_end_dt(inv.get("period_end"))
                await db.commit()

    return {"received": True}
