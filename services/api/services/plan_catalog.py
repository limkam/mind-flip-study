from __future__ import annotations

from config import settings


PLAN_LABELS: dict[str, str] = {
    "free": "Free",
    "quick_72": "Quick 7",
    "standard_15": "Standard 15",
    "premium_30": "Premium 30",
}


def plan_label_from_slug(plan_slug: str | None) -> str:
    if not plan_slug:
        return PLAN_LABELS["free"]
    return PLAN_LABELS.get(str(plan_slug).strip().lower(), PLAN_LABELS["free"])


def normalize_plan_label(label: str | None) -> str:
    raw = str(label or "").strip().lower()
    if raw in {"quick", "quick_7", "quick 7", "quick_72", "quick 72"}:
        return PLAN_LABELS["quick_72"]
    if raw in {
        "standard",
        "standard_15",
        "standard 15",
        "student",
        "student plan",
    }:
        return PLAN_LABELS["standard_15"]
    if raw in {"premium", "premium_30", "premium 30"}:
        return PLAN_LABELS["premium_30"]
    if raw in {"free", "free plan", "free tier"}:
        return PLAN_LABELS["free"]
    return str(label or "Free")


def monthly_price_cents_for_plan_slug(plan_slug: str | None) -> int:
    slug = str(plan_slug or "free").strip().lower()
    if slug == "quick_72":
        return int(settings.BILLING_PRICE_CENTS_QUICK_MONTHLY)
    if slug == "standard_15":
        return int(settings.BILLING_PRICE_CENTS_STANDARD_MONTHLY)
    if slug == "premium_30":
        return int(settings.BILLING_PRICE_CENTS_PREMIUM_MONTHLY)
    return 0