"""Idempotent Stripe-to-database reconciliation for billing facts."""

from __future__ import annotations

from datetime import datetime, timezone

import stripe
from sqlalchemy import select

from config import settings
from database_sync import sync_session
from models.billing_analytics import BillingEvent, BillingInvoice
from models.plan import Plan
from models.user import User
from models.user_subscription import UserSubscription


ACTIVE_STATUSES = {"active", "trialing", "past_due"}


def _dict(value):
    if value is None:
        return {}
    if isinstance(value, dict):
        return value
    to_dict = (
        getattr(value, "to_dict_recursive", None)
        or getattr(value, "_to_dict_recursive", None)
        or getattr(value, "to_dict", None)
    )
    converted = to_dict() if callable(to_dict) else None
    return converted if isinstance(converted, dict) else {}


def _dt(value):
    try:
        return datetime.fromtimestamp(int(value), tz=timezone.utc) if value else None
    except (TypeError, ValueError, OSError):
        return None


def _price_catalog() -> dict[str, str]:
    return {
        value: slug
        for slug, values in {
            "quick_72": [settings.STRIPE_PRICE_ID_QUICK_MONTHLY, settings.STRIPE_PRICE_ID_QUICK_ANNUAL,
                         settings.STRIPE_PRICE_ID_QUICK7_MONTHLY, settings.STRIPE_PRICE_ID_QUICK7_YEARLY],
            "standard_15": [settings.STRIPE_PRICE_ID_STANDARD_MONTHLY, settings.STRIPE_PRICE_ID_STANDARD_ANNUAL,
                            settings.STRIPE_PRICE_ID_BASIC, settings.STRIPE_PRICE_ID],
            "premium_30": [settings.STRIPE_PRICE_ID_PREMIUM_MONTHLY, settings.STRIPE_PRICE_ID_PREMIUM_ANNUAL,
                           settings.STRIPE_PRICE_ID_PREMIUM],
        }.items()
        for value in values if value
    }


def _subscription_fields(raw) -> dict:
    sub = _dict(raw)
    items = _dict(sub.get("items")).get("data") or []
    item = _dict(items[0]) if items else {}
    price = _dict(item.get("price"))
    recurring = _dict(price.get("recurring"))
    return {
        "stripe_subscription_id": str(sub.get("id")),
        "status": str(sub.get("status") or "unknown"),
        "price_id": str(price.get("id")) if price.get("id") else None,
        "unit_amount_cents": int(price.get("unit_amount") or 0),
        "billing_interval": recurring.get("interval"),
        "interval_count": int(recurring.get("interval_count") or 1),
        "current_period_end": _dt(sub.get("current_period_end") or item.get("current_period_end")),
        "created_at": _dt(sub.get("created")),
    }


def _invoice_subscription_id(inv: dict) -> str | None:
    direct = inv.get("subscription")
    if isinstance(direct, str):
        return direct
    parent = _dict(inv.get("parent"))
    details = _dict(parent.get("subscription_details"))
    value = details.get("subscription")
    return str(value) if value else None


def _invoice_price_id(inv: dict) -> str | None:
    lines = _dict(inv.get("lines")).get("data") or []
    line = _dict(lines[0]) if lines else {}
    price = _dict(line.get("price"))
    if price.get("id"):
        return str(price["id"])
    details = _dict(_dict(line.get("pricing")).get("price_details"))
    return str(details.get("price")) if details.get("price") else None


def _invoice_payment_intent(inv: dict) -> str | None:
    direct = inv.get("payment_intent")
    if isinstance(direct, str):
        return direct
    payments = _dict(inv.get("payments")).get("data") or []
    payment = _dict(payments[0]) if payments else {}
    pi = payment.get("payment_intent")
    return str(pi) if pi else None


def reconcile_stripe(*, limit: int = 100) -> dict[str, int]:
    if not settings.STRIPE_SECRET_KEY:
        raise RuntimeError("Stripe is not configured")
    stripe.api_key = settings.STRIPE_SECRET_KEY
    catalog = _price_catalog()
    counts = {"subscriptions_seen": 0, "subscriptions_upserted": 0, "invoices_seen": 0,
              "invoices_upserted": 0, "events_seen": 0, "conflicted_users": 0}

    products = {_dict(p).get("id"): _dict(p) for p in stripe.Product.list(limit=limit).auto_paging_iter()}
    for raw_price in stripe.Price.list(limit=limit).auto_paging_iter():
        price = _dict(raw_price)
        product = products.get(price.get("product"), {})
        name = str(product.get("name") or "").lower()
        slug = "premium_30" if "premium" in name else "standard_15" if "standard" in name else "quick_72" if "quick" in name else None
        if slug and price.get("id"):
            catalog.setdefault(str(price["id"]), slug)

    subscriptions = list(stripe.Subscription.list(status="all", limit=limit).auto_paging_iter())
    invoices = list(stripe.Invoice.list(limit=limit).auto_paging_iter())
    events = list(stripe.Event.list(limit=limit).auto_paging_iter())

    with sync_session() as db:
        users = {u.stripe_customer_id: u for u in db.execute(select(User).where(User.stripe_customer_id.is_not(None))).scalars()}
        plans = {p.slug: p for p in db.execute(select(Plan)).scalars()}

        for raw in subscriptions:
            sub = _dict(raw)
            counts["subscriptions_seen"] += 1
            user = users.get(str(sub.get("customer")))
            fields = _subscription_fields(raw)
            slug = catalog.get(fields["price_id"] or "")
            plan = plans.get(slug or "")
            if not user or not plan:
                continue
            row = db.execute(select(UserSubscription).where(UserSubscription.stripe_subscription_id == fields["stripe_subscription_id"])).scalar_one_or_none()
            if row is None:
                row = UserSubscription(user_id=user.id, plan_id=plan.id,
                                       stripe_subscription_id=fields["stripe_subscription_id"],
                                       status=fields["status"])
                db.add(row)
            row.plan_id = plan.id
            row.status = fields["status"]
            row.billing_interval = fields["billing_interval"]
            row.stripe_price_id = fields["price_id"]
            row.unit_amount_cents = fields["unit_amount_cents"]
            row.interval_count = fields["interval_count"]
            row.current_period_end = fields["current_period_end"]
            counts["subscriptions_upserted"] += 1

        for raw in invoices:
            inv = _dict(raw)
            counts["invoices_seen"] += 1
            customer_id = str(inv.get("customer") or "")
            user = users.get(customer_id)
            invoice_id = inv.get("id")
            if not user or not invoice_id:
                continue
            row = db.execute(select(BillingInvoice).where(BillingInvoice.stripe_invoice_id == str(invoice_id))).scalar_one_or_none()
            if row is None:
                row = BillingInvoice(stripe_invoice_id=str(invoice_id), user_id=user.id,
                                     stripe_customer_id=customer_id, status=str(inv.get("status") or "unknown"))
                db.add(row)
            transitions = _dict(inv.get("status_transitions"))
            row.stripe_subscription_id = _invoice_subscription_id(inv)
            row.stripe_payment_intent_id = _invoice_payment_intent(inv)
            row.plan_slug = catalog.get(_invoice_price_id(inv) or "")
            row.status = str(inv.get("status") or "unknown")
            row.currency = str(inv.get("currency") or "usd")
            row.amount_due_cents = int(inv.get("amount_due") or 0)
            row.amount_paid_cents = int(inv.get("amount_paid") or 0)
            row.amount_refunded_cents = int(inv.get("amount_refunded") or 0)
            row.paid_at = _dt(transitions.get("paid_at") or (inv.get("created") if row.status == "paid" else None))
            row.period_start = _dt(inv.get("period_start"))
            row.period_end = _dt(inv.get("period_end"))
            counts["invoices_upserted"] += 1

        for raw in events:
            event = _dict(raw)
            event_id = event.get("id")
            if not event_id:
                continue
            counts["events_seen"] += 1
            existing = db.execute(select(BillingEvent).where(BillingEvent.stripe_event_id == str(event_id))).scalar_one_or_none()
            if existing is None:
                db.add(BillingEvent(stripe_event_id=str(event_id), event_type=str(event.get("type") or "unknown"),
                                    status="reconciled", payload=None, processed_at=datetime.now(timezone.utc)))

        db.flush()
        conflicts = db.execute(sa_text("SELECT count(*) FROM (SELECT user_id FROM user_subscriptions WHERE status IN ('active','trialing','past_due') GROUP BY user_id HAVING count(*) > 1) q")).scalar()
        counts["conflicted_users"] = int(conflicts or 0)
    return counts


from sqlalchemy import text as sa_text
