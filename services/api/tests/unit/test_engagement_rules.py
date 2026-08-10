from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from uuid import uuid4

import pytest

from models.engagement import NudgeState
from services.engagement_rules import (
    DecisionAction,
    NudgeCandidate,
    event_actions,
    is_quiet_time,
    parse_clock,
    state_allows,
)


NOW = datetime(2026, 7, 29, 12, tzinfo=UTC)


def candidate(**overrides):
    values = dict(key="test", placement="dashboard", category="learning", priority=50,
                  title="Title", body="Body", action_label="Go", action_url="/go",
                  expires_at=NOW + timedelta(hours=1))
    values.update(overrides)
    return NudgeCandidate(**values)


def state(**overrides):
    values = dict(user_id=uuid4(), nudge_key="test", placement="dashboard",
                  first_eligible_at=NOW, impression_count=0, context={})
    values.update(overrides)
    return NudgeState(**values)


@pytest.mark.parametrize(
    ("row", "allowed"),
    [
        (None, True),
        (state(cooldown_until=NOW + timedelta(minutes=1)), False),
        (state(cooldown_until=NOW - timedelta(minutes=1)), True),
        (state(dismissed_at=NOW, cooldown_until=NOW + timedelta(days=7)), False),
        (state(converted_at=NOW), False),
        (state(expires_at=NOW), False),
        (state(impression_count=3), False),
    ],
)
def test_state_enforces_cooldown_dismissal_conversion_expiry_and_caps(row, allowed):
    assert state_allows(candidate(), row, NOW) is allowed


def test_candidate_expiry_and_priority_are_deterministic():
    assert not state_allows(candidate(expires_at=NOW), None, NOW)
    eligible = [candidate(key="low", priority=1), candidate(key="high", priority=100)]
    assert max(eligible, key=lambda item: item.priority).key == "high"


@pytest.mark.parametrize(
    ("at", "expected"),
    [(datetime(2026, 7, 29, 23, tzinfo=UTC), True),
     (datetime(2026, 7, 30, 6, 59, tzinfo=UTC), True),
     (datetime(2026, 7, 30, 12, tzinfo=UTC), False)],
)
def test_overnight_quiet_hours(at, expected):
    prefs = SimpleNamespace(quiet_hours_start="22:00", quiet_hours_end="07:00", timezone="UTC")
    assert is_quiet_time(at, prefs) is expected


def test_timezone_is_used_for_quiet_hours():
    prefs = SimpleNamespace(quiet_hours_start="22:00", quiet_hours_end="07:00", timezone="America/New_York")
    assert is_quiet_time(datetime(2026, 7, 29, 3, tzinfo=UTC), prefs)


def test_invalid_or_absent_quiet_hours_are_non_blocking():
    prefs = SimpleNamespace(quiet_hours_start=None, quiet_hours_end=None, timezone="UTC")
    assert parse_clock(None) is None
    assert not is_quiet_time(NOW, prefs)


def test_event_decisions_honor_preferences_and_support_no_action(monkeypatch):
    prefs = SimpleNamespace(in_app_enabled=True, achievement_announcements=True, celebration_animations=True, learning_reminders=True, quiet_hours_start=None, quiet_hours_end=None, timezone="UTC")
    actions = event_actions("achievement.unlocked", prefs)
    assert {DecisionAction.notification, DecisionAction.nudge, DecisionAction.celebration, DecisionAction.analytics} <= set(actions)
    assert event_actions("unsupported.event", prefs) == (DecisionAction.none,)

    prefs.achievement_announcements = False
    assert event_actions("achievement.unlocked", prefs) == (DecisionAction.analytics,)


def test_email_decision_requires_feature_flag_and_preference(monkeypatch):
    prefs = SimpleNamespace(in_app_enabled=True, achievement_announcements=True, celebration_animations=True, learning_reminders=True, quiet_hours_start=None, quiet_hours_end=None, timezone="UTC")
    monkeypatch.setattr("services.engagement_rules.settings.ENGAGEMENT_LIFECYCLE_EMAILS_ENABLED", True)
    assert DecisionAction.email in event_actions("lesson.started", prefs)
    prefs.learning_reminders = False
    assert DecisionAction.email not in event_actions("lesson.started", prefs)


def test_event_decisions_suppress_intrusive_actions_during_quiet_hours():
    prefs = SimpleNamespace(in_app_enabled=True, achievement_announcements=True, celebration_animations=True,
                            learning_reminders=True, quiet_hours_start="22:00", quiet_hours_end="07:00", timezone="UTC")
    at_night = datetime(2026, 7, 29, 23, tzinfo=UTC)
    assert event_actions("achievement.unlocked", prefs, at_night) == (DecisionAction.analytics,)
