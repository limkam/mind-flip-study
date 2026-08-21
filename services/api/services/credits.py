"""Credit ledger service helpers.

Provides helpers to read balances, consume credits, and award monthly allowances.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from models.credit_ledger import CreditLedger
from models.plan import Plan
from models.user import User
from models.user_subscription import UserSubscription


def credit_pack_tiers() -> list[dict]:
    """Configured extra-credit pack tiers: [{"credits", "price_cents", "price_id"}, ...].

    The ladder (credits/price_cents) is sourced from CREDIT_PACK_TIERS_JSON so adding
    or adjusting a tier only ever needs a config change, never a code change to the
    pricing/checkout logic that reads it. Each tier's "price_id" (a Stripe Price id) is
    read from a separate STRIPE_PRICE_ID_CREDIT_<credits> setting, matching the
    STRIPE_PRICE_ID_* naming convention used for subscriptions — it's optional, and
    checkout falls back to an inline price for any tier left unconfigured.
    """
    try:
        raw = json.loads(settings.CREDIT_PACK_TIERS_JSON)
    except (TypeError, ValueError):
        return []
    tiers: list[dict] = []
    for item in raw if isinstance(raw, list) else []:
        if not isinstance(item, dict):
            continue
        credits = item.get("credits")
        price_cents = item.get("price_cents")
        if isinstance(credits, int) and isinstance(price_cents, int) and credits > 0 and price_cents > 0:
            price_id = getattr(settings, f"STRIPE_PRICE_ID_CREDIT_{credits}", "")
            tiers.append({
                "credits": credits,
                "price_cents": price_cents,
                "price_id": price_id if isinstance(price_id, str) and price_id else None,
            })
    return tiers


def credit_tier_price_cents(credits: int) -> int | None:
    for tier in credit_pack_tiers():
        if tier["credits"] == credits:
            return tier["price_cents"]
    return None


def credit_tier_price_id(credits: int) -> str | None:
    for tier in credit_pack_tiers():
        if tier["credits"] == credits:
            return tier["price_id"]
    return None


async def _now() -> datetime:
    return datetime.now(timezone.utc)


async def _active_subscription_period_end(db: AsyncSession, user_id: UUID) -> datetime | None:
    """Return the paid-through subscription period end for a user, if available.

    Important behavior:
    - Uses internal subscription records as the source of truth.
    - If a user has canceled but still has time remaining in the paid period,
      that future ``current_period_end`` is still returned.
    """
    now = await _now()
    period_end = await db.scalar(
        select(UserSubscription.current_period_end)
        .where(
            UserSubscription.user_id == user_id,
            UserSubscription.current_period_end.is_not(None),
            UserSubscription.current_period_end > now,
        )
        .order_by(UserSubscription.current_period_end.desc())
        .limit(1)
    )
    return period_end


async def get_user_balance(db: AsyncSession, user_id: UUID, pool: str = "content") -> int:
    """Return the integer balance for `pool` (content|regen) for `user_id`.

    Only includes non-expired entries (expires_at is NULL or > now).
    """
    now = await _now()
    if pool == "purchased":
        q = select(func.coalesce(func.sum(CreditLedger.amount), 0)).where(
            CreditLedger.user_id == user_id,
            CreditLedger.pool == "purchased",
            (CreditLedger.expires_at.is_(None) | (CreditLedger.expires_at > now)),
        )
    else:
        # Effective action balance = monthly balance for the requested pool
        # + shared purchased credits (pool='purchased').
        q = select(func.coalesce(func.sum(CreditLedger.amount), 0)).where(
            CreditLedger.user_id == user_id,
            (
                # pool-specific entries (monthly + legacy purchased rows)
                (
                    (CreditLedger.pool == pool)
                    & (CreditLedger.expires_at.is_(None) | (CreditLedger.expires_at > now))
                )
                |
                # shared purchased credits usable for both content and regen
                (
                    (CreditLedger.pool == "purchased")
                    & (CreditLedger.expires_at.is_(None) | (CreditLedger.expires_at > now))
                )
            ),
        )
    r = await db.scalar(q)
    return max(0, int(r or 0))


async def _split_pool_balances(db: AsyncSession, user_id: UUID, pool: str = "content") -> tuple[int, int]:
    """Return (plan_balance, purchased_balance) for the user's action pool.

    Plan balance includes renewable allowances and the lifetime Free-plan grant.
    Purchased balance includes the shared purchased pool plus legacy pool-bound
    purchase grants. This classification is based on ledger provenance, not
    expiration alone.
    """
    now = await _now()
    plan_q = select(func.coalesce(func.sum(CreditLedger.amount), 0)).where(
        CreditLedger.user_id == user_id,
        CreditLedger.pool == pool,
        CreditLedger.reason != "purchased_credits",
        (CreditLedger.expires_at.is_(None) | (CreditLedger.expires_at > now)),
    )
    purchased_q = select(func.coalesce(func.sum(CreditLedger.amount), 0)).where(
        CreditLedger.user_id == user_id,
        (
            # shared purchased credits (new model)
            ((CreditLedger.pool == "purchased") & (CreditLedger.expires_at.is_(None) | (CreditLedger.expires_at > now)))
            |
            # legacy pool-bound purchased entries remain consumable
            ((CreditLedger.pool == pool) & (CreditLedger.expires_at.is_(None) | (CreditLedger.expires_at > now)) & (CreditLedger.reason == "purchased_credits"))
        ),
    )
    monthly = int(await db.scalar(plan_q) or 0)
    purchased = int(await db.scalar(purchased_q) or 0)
    return max(0, monthly), max(0, purchased)


# Refunds/chargebacks are not currently created by MindFlip. Reserving explicit
# reasons here prevents a future financial reversal from being mislabeled as
# product usage when that workflow is introduced.
PURCHASED_BALANCE_ADJUSTMENT_REASONS = {
    "credit_purchase_refund",
    "credit_purchase_reversal",
    "credit_chargeback",
    "admin_purchased_credit_adjustment",
}


async def get_credit_accounting_snapshot(db: AsyncSession, user_id: UUID, *, pool: str = "content") -> dict:
    """Return the authoritative plan/purchased accounting position.

    ``purchased_total`` is the net valid purchased allocation before usage:
    remaining purchased ledger balance plus purchased-pool consumption. Thus
    explicit reversals reduce the allocation rather than masquerading as usage.
    """
    now = await _now()
    plan_condition = (
        (CreditLedger.pool == pool)
        & (CreditLedger.reason != "purchased_credits")
        & (CreditLedger.expires_at.is_(None) | (CreditLedger.expires_at > now))
    )
    purchased_condition = (
        (CreditLedger.pool == "purchased")
        | ((CreditLedger.pool == pool) & (CreditLedger.reason == "purchased_credits"))
    ) & (CreditLedger.expires_at.is_(None) | (CreditLedger.expires_at > now))
    is_purchased_usage = (
        purchased_condition
        & (CreditLedger.amount < 0)
        & CreditLedger.reason.not_in(PURCHASED_BALANCE_ADJUSTMENT_REASONS)
    )
    row = (
        await db.execute(
            select(
                func.coalesce(func.sum(case((plan_condition & (CreditLedger.amount > 0), CreditLedger.amount), else_=0)), 0),
                func.coalesce(func.sum(case((plan_condition, CreditLedger.amount), else_=0)), 0),
                func.coalesce(func.sum(case((purchased_condition, CreditLedger.amount), else_=0)), 0),
                func.coalesce(func.sum(case((is_purchased_usage, -CreditLedger.amount), else_=0)), 0),
            ).where(CreditLedger.user_id == user_id)
        )
    ).one()
    plan_allocated, plan_remaining, purchased_remaining, purchased_used = map(int, row)
    plan_remaining = max(0, plan_remaining)
    purchased_remaining = max(0, purchased_remaining)
    purchased_used = max(0, purchased_used)
    purchased_total = max(0, purchased_remaining + purchased_used)
    plan_used = max(0, plan_allocated - plan_remaining)
    return {
        "available_total": plan_remaining + purchased_remaining,
        "plan": {"allocated": plan_allocated, "used": plan_used, "remaining": plan_remaining},
        "purchased": {
            "purchased_total": purchased_total,
            "used": purchased_used,
            "remaining": purchased_remaining,
        },
    }


async def consume_credits(db: AsyncSession, user_id: UUID, amount: int, *, pool: str = "content", reason: str, metadata: Optional[dict] | None = None) -> int:
    """Atomically consume credits by appending a negative ledger entry.

    Raises 402/403 if insufficient funds.
    Returns new balance after consumption.
    """
    if amount <= 0:
        raise ValueError("amount must be positive")

    # Serialize all credit mutations for a user inside the caller's transaction.
    await db.execute(select(User.id).where(User.id == user_id).with_for_update())

    balance = await get_user_balance(db, user_id, pool=pool)
    if balance < amount:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail={
                "code": "INSUFFICIENT_CREDITS",
                "message": "Not enough credits for this action.",
                "balance": balance,
                "required": amount,
            },
        )

    # Consume eligible plan credits first (renewable or lifetime Free grant),
    # then shared non-expiring purchased credits.
    monthly_balance, purchased_balance = await _split_pool_balances(db, user_id, pool=pool)
    remaining = int(amount)
    # consume from monthly first
    if monthly_balance > 0:
        take = min(monthly_balance, remaining)
        monthly_expires_at = await db.scalar(
            select(func.min(CreditLedger.expires_at)).where(
                CreditLedger.user_id == user_id,
                CreditLedger.pool == pool,
                CreditLedger.expires_at.is_not(None),
                CreditLedger.expires_at > await _now(),
            )
        )
        entry = CreditLedger(
            user_id=user_id,
            amount=-int(take),
            pool=pool,
            reason=f"{reason}",
            meta={**(metadata or {}), "consumed_from": "plan_credits"},
            expires_at=monthly_expires_at,
        )
        db.add(entry)
        remaining -= take

    if remaining > 0:
        # Consume from shared purchased extra credits in a separate pool (non-expiring).
        entry2 = CreditLedger(
            user_id=user_id,
            amount=-int(remaining),
            pool="purchased",
            reason=f"{reason}",
            meta={**(metadata or {}), "consumed_from": "purchased_or_unlocked", "consumed_for_pool": pool},
            expires_at=None,
        )
        db.add(entry2)

    await db.flush()

    new_balance = await get_user_balance(db, user_id, pool=pool)
    return new_balance


async def consume_extra_credits(
    db: AsyncSession,
    user_id: UUID,
    amount: int = 1,
    *,
    reason: str,
    metadata: Optional[dict] | None = None,
) -> int:
    """Consume ONLY purchased extra credits (pool='purchased', non-expiring).

    Subscription monthly credits (with expires_at) CANNOT be used for these premium actions.
    Raises HTTP 402 INSUFFICIENT_CREDITS if extra credits are 0.
    """
    if amount <= 0:
        raise ValueError("amount must be positive")

    await db.execute(select(User.id).where(User.id == user_id).with_for_update())

    purchased_balance = await get_user_balance(db, user_id, pool="purchased")
    if purchased_balance < amount:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail={
                "code": "INSUFFICIENT_CREDITS",
                "message": f"Extra credits are required for this action ({reason}). Purchase credits to continue.",
                "balance": purchased_balance,
                "required": amount,
            },
        )

    entry = CreditLedger(
        user_id=user_id,
        amount=-int(amount),
        pool="purchased",
        reason=reason,
        meta={**(metadata or {}), "consumed_from": "extra_credits"},
        expires_at=None,
    )
    db.add(entry)
    await db.flush()

    new_balance = await get_user_balance(db, user_id, pool="purchased")
    return new_balance


def _period_end_for_next_cycle(dt: datetime) -> datetime:
    # Return start of next month as expires_at for monthly allowances
    year = dt.year + (dt.month // 12)
    month = (dt.month % 12) + 1
    return datetime(year, month, 1, tzinfo=dt.tzinfo)


async def award_monthly_allowance_for_user(db: AsyncSession, user_id: UUID, plan_id: UUID, *, period_end: datetime | None = None) -> None:
    """Award subscription allowances for a user according to their plan.

    Subscription allowances expire at the subscription current_period_end.
    """
    now = await _now()
    plan = await db.get(Plan, plan_id)
    if plan is None:
        return

    expires_at = period_end
    if expires_at is None:
        try:
            expires_at = await _active_subscription_period_end(db, user_id)
        except Exception:
            expires_at = None
    if expires_at is None:
        expires_at = _period_end_for_next_cycle(now)

    period_key = period_end.strftime("%Y-%m-%d") if period_end else now.strftime("%Y-%m")
    await db.execute(select(User.id).where(User.id == user_id).with_for_update())

    if plan.monthly_content_allowance and plan.monthly_content_allowance > 0:
        grant_key = f"monthly:{user_id}:content:{period_key}"
        if not await db.scalar(select(CreditLedger.id).where(CreditLedger.idempotency_key == grant_key)):
            db.add(CreditLedger(
                user_id=user_id,
                amount=int(plan.monthly_content_allowance),
                pool="content",
                reason="monthly_allowance",
                idempotency_key=grant_key,
                meta={"plan": plan.slug, "reset_period": period_key, "eligible_actions": ["create_book", "create_set"]},
                expires_at=expires_at,
            ))

    if plan.monthly_regen_allowance and plan.monthly_regen_allowance > 0:
        grant_key = f"monthly:{user_id}:regen:{period_key}"
        if not await db.scalar(select(CreditLedger.id).where(CreditLedger.idempotency_key == grant_key)):
            db.add(CreditLedger(
                user_id=user_id,
                amount=int(plan.monthly_regen_allowance),
                pool="regen",
                reason="monthly_regen_allowance",
                idempotency_key=grant_key,
                meta={"plan": plan.slug, "reset_period": period_key, "eligible_actions": ["regeneration"]},
                expires_at=expires_at,
            ))

    await db.flush()


async def award_initial_free_credits(db: AsyncSession, user_id: UUID) -> None:
    """Award free-tier one-time lifetime credits at signup.

    This function grants the `free` plan's content allowance as a non-expiring
    ledger entry (expires_at=None) so it is treated as lifetime credits.
    """
    # find the free plan
    free = await db.scalar(select(Plan).where(Plan.slug == "free"))
    if free is None:
        return

    # grant only if the user has no existing lifetime free grant (avoid dupes)
    existing = await db.scalar(
        select(func.coalesce(func.sum(CreditLedger.amount), 0)).where(
            CreditLedger.user_id == user_id,
            CreditLedger.pool == "content",
            CreditLedger.reason == "signup_free_grant",
        )
    )
    if int(existing or 0) > 0:
        return

    db.add(
        CreditLedger(
            user_id=user_id,
            amount=int(free.monthly_content_allowance),
            pool="content",
            reason="signup_free_grant",
            meta={"plan": free.slug},
            expires_at=None,
        )
    )
    await db.flush()


async def reverse_onetime_credits_for_user(
    db: AsyncSession,
    user_id: UUID,
    amount: int,
    *,
    reason: str = "credit_purchase_refund",
    idempotency_key: str | None = None,
    metadata: Optional[dict] | None = None,
) -> None:
    """Claw back previously granted purchased credits (e.g. after a Stripe refund).

    Mirrors ``award_onetime_credits_for_user``: a signed ledger entry, never a
    raw balance edit. If more credits were already spent than remain, the raw
    ledger sum goes negative, but every balance read (``get_user_balance``,
    ``_split_pool_balances``, ``get_credit_accounting_snapshot``) already
    floors at zero, so the effective, user-visible balance is simply capped at
    zero rather than tracked as a negative debt.
    """
    if amount <= 0:
        return

    db.add(
        CreditLedger(
            user_id=user_id,
            amount=-int(amount),
            pool="purchased",
            reason=reason,
            idempotency_key=idempotency_key,
            meta=metadata or {},
            expires_at=None,
        )
    )
    await db.flush()


async def award_onetime_credits_for_user(
    db: AsyncSession,
    user_id: UUID,
    amount: int,
    *,
    stripe_session_id: str | None = None,
) -> None:
    """Award one-time purchased extra credits to a user.

    Extra purchased credits are permanent and do NOT expire with subscription resets.
    """
    if amount <= 0:
        return

    db.add(
        CreditLedger(
            user_id=user_id,
            amount=int(amount),
            pool="purchased",
            reason="purchased_credits",
            idempotency_key=(f"stripe_checkout:{stripe_session_id}:credits" if stripe_session_id else None),
            meta={"purchase_type": "stripe_checkout", "stripe_session_id": stripe_session_id},
            expires_at=None,
        )
    )
    await db.flush()
