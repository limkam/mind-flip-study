"""SM-2 unit tests (Section 4 spec)."""

from datetime import date, timedelta

from services.spaced_rep import compute_sm2

_FIXED = date(2026, 5, 10)


def test_perfect_recall_increases_interval():
    result = compute_sm2(quality=5, ease_factor=2.5, interval_days=6, repetitions=2, review_date=_FIXED)
    assert result.interval_days > 6
    assert result.ease_factor >= 2.5


def test_blackout_resets_interval():
    result = compute_sm2(quality=0, ease_factor=2.5, interval_days=30, repetitions=10, review_date=_FIXED)
    assert result.interval_days == 1


def test_ease_factor_floor():
    result = compute_sm2(quality=0, ease_factor=1.4, interval_days=1, repetitions=1, review_date=_FIXED)
    assert result.ease_factor >= 1.3


def test_next_review_date_is_future():
    result = compute_sm2(quality=4, ease_factor=2.5, interval_days=1, repetitions=1, review_date=_FIXED)
    assert result.next_review_date > _FIXED


def test_quality_3_threshold():
    bad = compute_sm2(quality=2, ease_factor=2.5, interval_days=10, repetitions=5, review_date=_FIXED)
    good = compute_sm2(quality=3, ease_factor=2.5, interval_days=10, repetitions=5, review_date=_FIXED)
    assert bad.interval_days < good.interval_days
