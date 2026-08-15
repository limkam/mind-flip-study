from services.financial_metrics_service import (
    ELIGIBLE_SUBSCRIPTION_STATUSES,
    FinancialSnapshot,
    calculate_arppu,
    calculate_arr,
    calculate_mrr,
    calculate_mrr_change,
)


def test_monthly_subscriptions_normalize_by_interval_count():
    assert calculate_mrr([(999, "month", 1), (1998, "month", 2)]) == 19.98


def test_annual_subscriptions_normalize_by_twelve_and_interval_count():
    assert calculate_mrr([(12000, "year", 1), (24000, "year", 2)]) == 20.00


def test_mrr_is_independent_of_recognized_revenue_and_elapsed_days():
    subscriptions = [(1996, "month", 1)]
    assert calculate_mrr(subscriptions) == 19.96
    # No invoice revenue, dates, or elapsed-day argument exists in the canonical API.
    assert calculate_mrr(subscriptions) == 19.96


def test_arr_and_subscription_arppu_derive_only_from_mrr():
    assert calculate_arr(19.96) == 239.52
    assert calculate_arppu(19.96, 2) == 9.98


def test_missing_historical_snapshot_makes_mrr_change_unavailable():
    assert calculate_mrr_change(19.96, None) is None


def test_eligible_statuses_are_explicit_and_shared():
    # Contracted MRR excludes free trials and delinquent subscriptions; paid
    # invoice revenue is reported independently.
    assert ELIGIBLE_SUBSCRIPTION_STATUSES == ("active",)


def test_duplicate_subscriptions_mark_provider_snapshot_conflicted():
    snapshot = FinancialSnapshot(19.96, 239.52, 2, 4, 9.98, 1)
    assert snapshot.includes_conflicts is True
