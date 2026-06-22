"""Tests for learning pace service."""

from datetime import date, timedelta

from services.learning_pace import (
    adjusted_due_limit,
    adjust_next_review_date,
    pace_profile,
    resolve_learning_pace,
)


def test_resolve_learning_pace_defaults_to_medium():
    assert resolve_learning_pace(None) == "medium"
    assert resolve_learning_pace({}) == "medium"
    assert resolve_learning_pace({"settings": {"learning_pace": "intensive"}}) == "intensive"


def test_adjusted_due_limit_scales_by_pace():
    relaxed = {"settings": {"learning_pace": "relaxed"}}
    intensive = {"settings": {"learning_pace": "intensive"}}
    assert adjusted_due_limit(20, relaxed) == 12
    assert adjusted_due_limit(20, None) == 20
    assert adjusted_due_limit(20, intensive) == 30


def test_adjust_next_review_date_relaxed_extends_interval():
    review = date(2026, 6, 20)
    next_due = date(2026, 6, 27)
    relaxed = {"settings": {"learning_pace": "relaxed"}}
    adjusted = adjust_next_review_date(next_due, review, relaxed)
    assert adjusted > next_due


def test_pace_profile_has_description():
    profile = pace_profile({"settings": {"learning_pace": "relaxed"}})
    assert "description" in profile
    assert profile["daily_review_target"] == 10
