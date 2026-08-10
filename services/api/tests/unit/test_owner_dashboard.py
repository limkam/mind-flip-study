from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

from services.owner_dashboard_service import (
    change,
    customer_health_score,
    project_month,
    recognized_cents,
)


def invoice(*, paid=12000, refunded=0, paid_at=None, start=None, end=None):
    return SimpleNamespace(
        amount_paid_cents=paid,
        amount_refunded_cents=refunded,
        paid_at=paid_at,
        period_start=start,
        period_end=end,
    )


def test_annual_subscription_revenue_is_recognized_over_service_period():
    year = datetime(2026, 1, 1, tzinfo=UTC)
    month = datetime(2026, 2, 1, tzinfo=UTC)
    inv = invoice(start=year, end=datetime(2027, 1, 1, tzinfo=UTC), paid_at=year)
    assert 1000 <= recognized_cents(inv, year, month) <= 1020


def test_refund_reduces_recognized_revenue():
    start = datetime(2026, 1, 1, tzinfo=UTC)
    end = start + timedelta(days=30)
    assert (
        recognized_cents(
            invoice(paid=10000, refunded=2500, start=start, end=end), start, end
        )
        == 7500
    )


def test_recognition_only_counts_overlapping_period():
    start = datetime(2026, 2, 1, tzinfo=UTC)
    end = datetime(2026, 3, 1, tzinfo=UTC)
    inv = invoice(
        start=datetime(2026, 1, 1, tzinfo=UTC),
        end=start,
        paid_at=datetime(2026, 1, 1, tzinfo=UTC),
    )
    assert recognized_cents(inv, start, end) == 0


def test_month_over_month_change_and_zero_baseline():
    assert change(120, 100) == (20.0, "up")
    assert change(10, 0) == (None, "up")


def test_forecast_uses_observed_daily_run_rate():
    assert project_month(1_000, 10, 30) == 3_000


def test_health_score_penalizes_past_due_and_ai_cost():
    healthy = customer_health_score(20, 2, "active")
    risky = customer_health_score(-10, 30, "past_due")
    assert healthy > risky
    assert 0 <= risky <= 100


def test_health_score_is_bounded():
    assert customer_health_score(1_000, 0, "active") == 90
    assert customer_health_score(-1_000, 1_000, "past_due") == 0


def test_missing_attribution_is_not_reported_as_zero():
    from schemas.owner_dashboard import Metric

    metric = Metric(
        key="avg_ai_chapter",
        label="Average AI Cost / Chapter",
        value=None,
        status="unavailable",
        reason="Canonical chapter-level AI attribution is not stored.",
        definition="Unavailable without attribution.",
        tooltip="Unavailable without attribution.",
        as_of=datetime.now(UTC),
    )
    assert metric.value is None
    assert metric.status == "unavailable"
