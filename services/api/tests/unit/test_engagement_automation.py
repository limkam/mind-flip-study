from datetime import UTC, datetime

import pytest

from config import settings
from models.engagement import EngagementPreference
from services.automation_logging import EVENTS, FIELDS, task_event
from services.automation_metrics import (
    COUNTERS,
    TIMINGS,
    RecordingMetrics,
    increment,
    observe,
    set_metrics_adapter,
)
from services.engagement_automation import next_local_week, next_streak_risk
from services.engagement_rules import DecisionAction, event_actions
from tasks.celery_app import PHASE3_BEAT_SCHEDULE


def test_automation_configuration_rejects_tight_scan(monkeypatch):
    monkeypatch.setattr(settings, "INACTIVITY_SCAN_INTERVAL_MINUTES", 1)
    with pytest.raises(ValueError, match="INACTIVITY_SCAN"):
        settings.validate_automation_policy()


def test_weekly_and_streak_due_times_use_timezone_and_dst(monkeypatch):
    now = datetime(2026, 3, 8, 6, 30, tzinfo=UTC)
    assert next_local_week(now, "America/New_York") == datetime(
        2026, 3, 9, 13, 0, tzinfo=UTC
    )
    monkeypatch.setattr(settings, "STREAK_RISK_WINDOW_MINUTES", 120)
    assert next_streak_risk(now, "America/New_York") > now
    assert next_local_week(now, "invalid/timezone").tzinfo == UTC


def test_phase1_authorises_weekly_but_not_unsupported_journeys(monkeypatch):
    prefs = EngagementPreference(weekly_summaries=True, learning_reminders=True)
    monkeypatch.setattr(settings, "ENGAGEMENT_LIFECYCLE_EMAILS_ENABLED", True)
    assert DecisionAction.email in event_actions("weekly_summary.eligible", prefs)
    assert DecisionAction.email not in event_actions("inactivity.eligible", prefs)
    assert DecisionAction.email not in event_actions("streak.at_risk", prefs)


def test_phase3_schedules_are_central_and_not_one_second_scans():
    expected = {
        "engagement-due-email",
        "engagement-weekly-summary-scan",
        "engagement-inactivity-scan",
        "engagement-streak-risk-scan",
        "engagement-cleanup",
    }
    assert expected <= PHASE3_BEAT_SCHEDULE.keys()
    assert all(float(PHASE3_BEAT_SCHEDULE[key]["schedule"]) >= 10 for key in expected)


def test_all_required_metrics_are_recordable_with_low_cardinality_labels():
    recording = RecordingMetrics()
    previous = set_metrics_adapter(recording)
    try:
        labels = {
            "automation_type": "due_email",
            "journey": "weekly_summary",
            "action_type": "email",
            "attempt_type": "first",
            "outcome": "delivered",
            "failure_category": "none",
        }
        for metric in sorted(COUNTERS):
            increment(metric, 2, **labels)
        for metric in sorted(TIMINGS):
            observe(metric, 0.25, **labels)
    finally:
        set_metrics_adapter(previous)

    assert {event.name for event in recording.events} == COUNTERS | TIMINGS
    assert all(event.value in {2.0, 0.25} for event in recording.events)
    assert all(event.labels == labels for event in recording.events)
    assert all(event.kind in {"counter", "timing"} for event in recording.events)


def test_metrics_reject_high_cardinality_labels():
    with pytest.raises(ValueError, match="forbidden metric labels"):
        increment("engagement_actions_delivered_total", user_id="private")


def test_every_structured_event_has_complete_schema_without_pii(caplog):
    caplog.set_level("INFO", logger="engagement.automation")
    for event in sorted(EVENTS):
        record = task_event(
            event,
            automation_type="weekly_summary",
            correlation_id="correlation-safe",
            outcome="completed",
            email="private@example.test",
            raw_provider_payload={"secret": "never-log"},
        )
        assert set(record) == set(FIELDS) | {"event"}
        assert record["event"] == event
        assert record["correlation_id"] == "correlation-safe"
    rendered = caplog.text
    assert "private@example.test" not in rendered
    assert "never-log" not in rendered
