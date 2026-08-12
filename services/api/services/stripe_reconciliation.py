"""Idempotent Stripe-to-database reconciliation for billing facts."""

from __future__ import annotations

import logging
from datetime import datetime, timezone

import stripe
from sqlalchemy import select

from config import settings
from database_sync import sync_session
from models.billing_analytics import BillingEvent, BillingInvoice
from models.credit_ledger import CreditLedger
from models.credit_purchase import CreditPurchase
from models.plan import Plan
from models.user import User
from models.user_subscription import UserSubscription


ACTIVE_STATUSES = {"active", "trialing", "past_due"}
logger = logging.getLogger(__name__)


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
              "invoices_upserted": 0, "events_seen": 0, "conflicted_users": 0,
              "credit_sessions_seen": 0, "credit_purchases_recovered": 0,
              "credit_sessions_invalid": 0, "credit_receipts_updated": 0}

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
    checkout_sessions = list(stripe.checkout.Session.list(limit=limit).auto_paging_iter())

    with sync_session() as db:
        users = {u.stripe_customer_id: u for u in db.execute(select(User).where(User.stripe_customer_id.is_not(None))).scalars()}
        plans = {p.slug: p for p in db.execute(select(Plan)).scalars()}

        for raw in checkout_sessions:
            session = _dict(raw)
            if session.get("mode") != "payment":
                continue
            counts["credit_sessions_seen"] += 1
            session_id = str(session.get("id") or "")
            metadata = _dict(session.get("metadata"))
            customer_id = str(session.get("customer") or "")
            user = users.get(customer_id)
            try:
                quantity = int(metadata.get("credit_quantity"))
                unit_price = int(metadata.get("unit_price_cents"))
                metadata_user_id = str(metadata.get("user_id") or "")
                amount_total = int(session.get("amount_total"))
            except (TypeError, ValueError):
                counts["credit_sessions_invalid"] += 1
                continue
            currency = str(session.get("currency") or metadata.get("currency") or "").lower()
            valid = (
                bool(session_id)
                and session.get("payment_status") == "paid"
                and user is not None
                and metadata_user_id == str(user.id)
                and str(session.get("client_reference_id") or user.id) == str(user.id)
                and 1 <= quantity <= 100
                and unit_price == int(settings.CREDIT_UNIT_PRICE_CENTS)
                and amount_total == quantity * unit_price
                and currency == str(settings.CREDIT_CURRENCY or "usd").lower()
            )
            if not valid:
                counts["credit_sessions_invalid"] += 1
                continue
            purchase = db.execute(
                select(CreditPurchase).where(CreditPurchase.stripe_session_id == session_id)
            ).scalar_one_or_none()
            payment_intent_id = session.get("payment_intent")
            if isinstance(payment_intent_id, dict):
                payment_intent_id = payment_intent_id.get("id")
            charge_id = None
            receipt_url = None
            if payment_intent_id:
                try:
                    payment_intent = _dict(stripe.PaymentIntent.retrieve(str(payment_intent_id), expand=["latest_charge"]))
                    latest_charge = payment_intent.get("latest_charge")
                    if isinstance(latest_charge, dict):
                        charge_id = latest_charge.get("id")
                        receipt_url = latest_charge.get("receipt_url")
                    elif isinstance(latest_charge, str):
                        charge_id = latest_charge
                except Exception:
                    logger.warning(
                        "stripe_reconciliation_receipt_lookup_failed",
                        extra={"payment_intent_id": str(payment_intent_id), "session_id": session_id},
                        exc_info=True,
                    )
            if purchase is not None:
                changed = False
                if not purchase.stripe_payment_intent_id and payment_intent_id:
                    purchase.stripe_payment_intent_id = str(payment_intent_id)
                    changed = True
                if not purchase.stripe_charge_id and charge_id:
                    purchase.stripe_charge_id = str(charge_id)
                    changed = True
                if not purchase.receipt_url and receipt_url:
                    purchase.receipt_url = str(receipt_url)
                    changed = True
                if changed:
                    counts["credit_receipts_updated"] += 1
                continue
            db.add(CreditLedger(
                user_id=user.id,
                amount=quantity,
                pool="purchased",
                reason="purchased_credits",
                idempotency_key=f"stripe_checkout:{session_id}:credits",
                meta={"purchase_type": "stripe_checkout", "stripe_session_id": session_id, "reconciled": True},
                expires_at=None,
            ))
            db.add(CreditPurchase(
                user_id=user.id,
                quantity=quantity,
                amount_paid_cents=amount_total,
                currency=currency,
                unit_price_cents=unit_price,
                stripe_session_id=session_id,
                stripe_payment_intent_id=str(payment_intent_id) if payment_intent_id else None,
                stripe_customer_id=customer_id,
                stripe_charge_id=str(charge_id) if charge_id else None,
                receipt_url=str(receipt_url) if receipt_url else None,
                status="completed",
                notes="Recovered from authoritative paid Stripe Checkout Session",
            ))
            counts["credit_purchases_recovered"] += 1

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
