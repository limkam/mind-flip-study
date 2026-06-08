"""SuperMemo SM-2 spaced repetition (pure functions)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone


def utc_calendar_today() -> date:
    """Calendar date in UTC (aligned with typical Postgres ``TIMEZONE=UTC``)."""
    return datetime.now(timezone.utc).date()


@dataclass
class SM2Result:
    ease_factor: float
    interval_days: int
    next_review_date: date


def compute_sm2(
    quality: int,
    ease_factor: float,
    interval_days: int,
    repetitions: int,
    *,
    review_date: date | None = None,
) -> SM2Result:
    """
    Standard SM-2 update.

    ``quality``: 0–5 (0=blackout, 5=perfect). Callers should validate range.

    On ``quality < 3``: interval resets to 1 day, ease factor unchanged.

    On ``quality >= 3``: ease factor adjusted, then interval depends on
    ``repetitions`` *before* this successful review (0 → 1 day, 1 → 6 days,
    else ``round(interval_days * new_ef)``).

    ``review_date``: calendar day used for ``next_review_date`` (default: UTC today).
    """
    today = review_date if review_date is not None else utc_calendar_today()
    if quality < 3:
        return SM2Result(
            ease_factor=ease_factor,
            interval_days=1,
            next_review_date=today + timedelta(days=1),
        )

    q = quality
    new_ef = ease_factor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
    new_ef = max(1.3, new_ef)

    if repetitions == 0:
        new_interval = 1
    elif repetitions == 1:
        new_interval = 6
    else:
        new_interval = max(1, round(interval_days * new_ef))

    return SM2Result(
        ease_factor=new_ef,
        interval_days=new_interval,
        next_review_date=today + timedelta(days=new_interval),
    )
