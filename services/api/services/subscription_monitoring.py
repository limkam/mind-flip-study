"""Canonical presentation semantics for synchronized subscriptions."""

import math
from datetime import UTC, datetime

from models.user_subscription import UserSubscription

ENTITLED_STATUSES = {"active", "trialing", "past_due", "canceled"}


def days_until(value: datetime | None, *, now: datetime | None = None) -> int | None:
    if value is None:
        return None
    current = now or datetime.now(UTC)
    return max(0, math.ceil((value - current).total_seconds() / 86400))


def subscription_time_state(sub: UserSubscription | None, *, conflict: bool = False, now: datetime | None = None) -> dict:
    current = now or datetime.now(UTC)
    if conflict:
        return {"kind": "conflict", "label": "Unavailable — billing conflict", "days_remaining": None}
    if sub is None:
        return {"kind": "free", "label": "Not applicable", "days_remaining": None}
    entitled = sub.status in ENTITLED_STATUSES and sub.current_period_end is not None and sub.current_period_end > current
    if not entitled:
        return {"kind": "expired", "label": "Expired", "days_remaining": 0}
    days = days_until(sub.current_period_end, now=current)
    ending = bool(sub.cancel_at_period_end or sub.status == "canceled")
    return {
        "kind": "ending" if ending else "active",
        "label": f"{days} days until access ends" if ending else f"{days} days remaining",
        "days_remaining": days,
    }


def trial_time_state(sub: UserSubscription | None, *, now: datetime | None = None) -> dict:
    current = now or datetime.now(UTC)
    if sub is None or sub.status != "trialing" or sub.trial_end is None or sub.trial_end <= current:
        return {"active": False, "label": "No active trial", "days_remaining": None}
    days = days_until(sub.trial_end, now=current)
    return {"active": True, "label": f"{days} days remaining", "days_remaining": days}
