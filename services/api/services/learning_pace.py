"""Learning pace preferences — adjusts review limits and SM-2 intervals."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

PACE_DEFAULT = "medium"

PACE_PROFILES: dict[str, dict[str, Any]] = {
    "relaxed": {
        "label": "Relaxed",
        "description": "Fewer reviews and a lighter study schedule.",
        "due_limit_multiplier": 0.6,
        "interval_multiplier": 1.5,
        "daily_review_target": 10,
        "weekly_card_goal_hint": 15,
    },
    "medium": {
        "label": "Balanced",
        "description": "A moderate pace for consistent learning.",
        "due_limit_multiplier": 1.0,
        "interval_multiplier": 1.0,
        "daily_review_target": 20,
        "weekly_card_goal_hint": 20,
    },
    "intensive": {
        "label": "Intensive",
        "description": "More reviews and higher daily study targets.",
        "due_limit_multiplier": 1.5,
        "interval_multiplier": 0.75,
        "daily_review_target": 40,
        "weekly_card_goal_hint": 50,
    },
}


def resolve_learning_pace(preferences: dict | None) -> str:
    if not preferences:
        return PACE_DEFAULT
    settings = preferences.get("settings") or {}
    pace = settings.get("learning_pace") or PACE_DEFAULT
    return pace if pace in PACE_PROFILES else PACE_DEFAULT


def pace_profile(preferences: dict | None) -> dict[str, Any]:
    return PACE_PROFILES[resolve_learning_pace(preferences)]


def adjusted_due_limit(base_limit: int, preferences: dict | None) -> int:
    profile = pace_profile(preferences)
    return max(5, min(100, round(base_limit * profile["due_limit_multiplier"])))


def adjust_next_review_date(
    next_review_date: date,
    review_date: date,
    preferences: dict | None,
) -> date:
    """Stretch or compress interval based on learning pace."""
    profile = pace_profile(preferences)
    multiplier = profile["interval_multiplier"]
    if multiplier == 1.0:
        return next_review_date
    raw_days = max(1, (next_review_date - review_date).days)
    adjusted = max(1, round(raw_days * multiplier))
    return review_date + timedelta(days=adjusted)
