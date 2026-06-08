"""Stripe Checkout + webhooks."""

from __future__ import annotations

import uuid
from enum import Enum
from typing import Annotated
from uuid import UUID

import stripe
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from database import get_db
from dependencies import get_current_user, get_redis
from models.user import User
from schemas.billing import CheckoutUrlResponse

router = APIRouter(tags=["billing"])


class BillingPlan(str, Enum):
    basic = "basic"
    premium = "premium"


def _price_id_for_plan(plan: BillingPlan) -> str:
    if plan == BillingPlan.premium:
        return settings.STRIPE_PRICE_ID_PREMIUM
    return settings.STRIPE_PRICE_ID_BASIC or settings.STRIPE_PRICE_ID


def _subscription_tier_for_plan(plan: str | None) -> str:
    if plan == BillingPlan.premium.value:
        return "premium"
    return "student"


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
    fn = getattr(obj, "to_dict_recursive", None) or getattr(obj, "to_dict", None)
    if callable(fn):
        out = fn()
        return out if isinstance(out, dict) else {}
    return {}


@router.post("/checkout", response_model=CheckoutUrlResponse)
async def create_checkout_session(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    plan: Annotated[BillingPlan, Query(description="Subscription plan to purchase")] = BillingPlan.basic,
) -> CheckoutUrlResponse:
    """Requires a valid Bearer access token (``HTTPBearer`` on ``get_current_user``)."""
    price_id = _price_id_for_plan(plan)
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

    base = settings.FRONTEND_URL.rstrip("/")
    session = stripe.checkout.Session.create(
        customer=user_row.stripe_customer_id,
        mode="subscription",
        line_items=[{"price": price_id, "quantity": 1}],
        success_url=f"{base}/billing/success",
        cancel_url=f"{base}/billing/cancel",
        client_reference_id=str(user_row.id),
        metadata={"user_id": str(user_row.id), "plan": plan.value},
        idempotency_key=f"mindflip:checkout_session:{user_row.id}:{uuid.uuid4().hex}",
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
                        user.subscription_tier = _subscription_tier_for_plan(
                            str(plan) if plan else None
                        )
                        await db.commit()

    elif etype == "customer.subscription.deleted":
        sub = data_object
        cid = sub.get("customer")
        if isinstance(cid, dict):
            cid = cid.get("id")
        if isinstance(cid, str):
            ur = await db.execute(select(User).where(User.stripe_customer_id == cid))
            user = ur.scalar_one_or_none()
            if user is not None:
                user.subscription_tier = "free"
                await db.commit()

    elif etype == "invoice.payment_failed":
        inv = data_object
        cid = inv.get("customer")
        if isinstance(cid, dict):
            cid = cid.get("id")
        if isinstance(cid, str):
            ur = await db.execute(select(User).where(User.stripe_customer_id == cid))
            user = ur.scalar_one_or_none()
            if user is not None:
                user.subscription_tier = "free"
                await db.commit()

    return {"received": True}
