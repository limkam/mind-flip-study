from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from services.subscription_monitoring import days_until, subscription_time_state, trial_time_state
from services.admin_metrics import rank_plan_counts
from services.activity_tracking import record_meaningful_activity
from services.admin_audit import record_admin_action


NOW = datetime(2026, 8, 15, 12, tzinfo=UTC)


def sub(**values):
    defaults = dict(status="active", current_period_end=NOW + timedelta(days=2, seconds=1), cancel_at_period_end=False, trial_end=None)
    defaults.update(values)
    return SimpleNamespace(**defaults)


def test_days_remaining_uses_ceiling_and_never_negative():
    assert days_until(NOW + timedelta(seconds=1), now=NOW) == 1
    assert days_until(NOW - timedelta(days=1), now=NOW) == 0
    assert days_until(None, now=NOW) is None


@pytest.mark.parametrize(("delta", "expected"), [
    (timedelta(hours=23, minutes=59), 1),
    (timedelta(minutes=1), 1),
    (timedelta(), 0),
    (timedelta(seconds=-1), 0),
    (timedelta(hours=24), 1),
])
def test_countdown_boundaries(delta, expected):
    assert days_until(NOW + delta, now=NOW) == expected


def test_subscription_days_states():
    assert subscription_time_state(sub(), now=NOW)["days_remaining"] == 3
    ending = subscription_time_state(sub(cancel_at_period_end=True), now=NOW)
    assert ending["kind"] == "ending"
    assert "access ends" in ending["label"]
    assert subscription_time_state(sub(status="unpaid"), now=NOW)["kind"] == "expired"
    assert subscription_time_state(None, now=NOW)["kind"] == "free"
    assert subscription_time_state(sub(), conflict=True, now=NOW)["kind"] == "conflict"


def test_trial_requires_genuine_trial_status_and_end():
    assert trial_time_state(sub(status="trialing", trial_end=NOW + timedelta(days=4)), now=NOW)["days_remaining"] == 4
    assert trial_time_state(sub(status="active", trial_end=NOW + timedelta(days=4)), now=NOW)["active"] is False
    assert trial_time_state(sub(status="trialing", trial_end=None), now=NOW)["label"] == "No active trial"


def test_plan_ranking_includes_free_and_preserves_ties_and_conflicts():
    result = rank_plan_counts({"Free": 10, "Standard": 5, "Premium": 5, "Quick": 1}, conflicts=2)
    assert result["included_users"] == 21
    assert result["billing_conflicts"] == 2
    assert result["highest"][0]["plan"] == "Free"
    assert {x["plan"] for x in result["second_highest"]} == {"Premium", "Standard"}
    assert result["lowest"][0]["plan"] == "Quick"


def test_all_tied_plan_ranking_is_explicit_and_not_contradictory():
    result = rank_plan_counts({"Free": 0, "Standard": 0, "Premium": 0})
    assert result["all_tied"] is True
    assert {row["plan"] for row in result["highest"]} == {"Free", "Standard", "Premium"}
    assert result["second_highest"] == []
    assert result["lowest"] == []


@pytest.mark.asyncio
async def test_meaningful_activity_is_persisted_and_updates_last_active():
    db = AsyncMock()
    db.add = MagicMock()
    db.scalar.return_value = uuid4()
    user = SimpleNamespace(id=uuid4(), last_active_at=None)
    assert await record_meaningful_activity(db, user, activity_key="study", platform="android") is True
    assert user.last_active_at is not None
    db.add.assert_called_once_with(user)
    db.commit.assert_awaited_once()


def test_admin_audit_write_is_append_only_fact_without_secrets():
    db = MagicMock()
    admin = SimpleNamespace(id=uuid4(), email="admin@example.com")
    row = record_admin_action(db, admin=admin, action="content.delete", resource_type="book", resource_id=uuid4(), reason="Duplicate upload")
    assert row.action == "content.delete"
    assert row.reason == "Duplicate upload"
    assert row.previous_value is None
    db.add.assert_called_once_with(row)
