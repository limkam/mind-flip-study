"""Batch 2 PostgreSQL evidence for streak-risk automation."""

import threading
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from config import settings
from models.automation import EngagementAutomationSchedule
from models.email import EmailJob
from models.engagement import EngagementEvent, LearningStreak
from services.engagement_automation import in_streak_risk_window
from tasks.automation_tasks import _evaluate_schedule
from tests.integration.test_engagement_automation_db import user_with_schedules

def streak_schedule(db, user_id):
    return db.scalar(select(EngagementAutomationSchedule).where(
        EngagementAutomationSchedule.user_id == user_id,
        EngagementAutomationSchedule.automation_type == "streak_risk"))


@pytest.mark.parametrize(("zone", "instant", "expected"), [
    ("UTC", "2026-01-15T21:59:59+00:00", False),
    ("UTC", "2026-01-15T22:00:00+00:00", True),
    ("UTC", "2026-01-15T23:59:59+00:00", True),
    ("UTC", "2026-01-16T00:00:00+00:00", False),
    ("America/New_York", "2026-03-09T02:30:00+00:00", True),
    ("America/New_York", "2026-11-02T03:30:00+00:00", True),
    ("Europe/London", "2026-03-29T22:30:00+00:00", True),
    ("invalid/timezone", "2026-01-15T22:00:00+00:00", True),
])
def test_risk_window_timezone_dst_and_boundaries(engine, monkeypatch, zone, instant, expected):
    monkeypatch.setattr(settings, "STREAK_RISK_WINDOW_MINUTES", 120)
    assert in_streak_risk_window(datetime.fromisoformat(instant), zone) is expected


@pytest.mark.parametrize(("streak_length", "last_offset"), [(0, 1), (3, 0), (3, 2)])
def test_non_risk_streak_states_are_suppressed_and_immutable(engine, monkeypatch,
                                                              streak_length, last_offset):
    monkeypatch.setattr(settings, "STREAK_RISK_WINDOW_MINUTES", 120)
    user_id = user_with_schedules(engine)
    now = datetime(2026, 1, 15, 23, tzinfo=UTC)
    with Session(engine) as db:
        db.add(LearningStreak(user_id=user_id, current_streak=streak_length,
            longest_streak=max(3, streak_length),
            last_qualifying_local_date=now.date() - timedelta(days=last_offset),
            last_qualifying_activity_at=now - timedelta(days=last_offset),
            streak_timezone="UTC"))
        schedule_id = streak_schedule(db, user_id).id
        db.commit()
    with Session(engine) as db:
        before = (db.get(LearningStreak, user_id).current_streak,
                  db.get(LearningStreak, user_id).last_qualifying_local_date,
                  db.get(LearningStreak, user_id).last_qualifying_activity_at)
    assert _evaluate_schedule(schedule_id, "streak_risk", now, uuid.uuid4()) == "suppressed"
    with Session(engine) as db:
        streak = db.get(LearningStreak, user_id)
        assert (streak.current_streak, streak.last_qualifying_local_date,
                streak.last_qualifying_activity_at) == before
        assert db.scalar(select(func.count()).select_from(EngagementEvent).where(
            EngagementEvent.user_id == user_id,
            EngagementEvent.event_type == "streak.at_risk")) == 0
        assert db.scalar(select(func.count()).select_from(EmailJob).where(
            EmailJob.user_id == user_id)) == 0


def test_positive_streak_risk_is_idempotent_email_safe_and_immutable(engine, monkeypatch):
    monkeypatch.setattr(settings, "STREAK_RISK_WINDOW_MINUTES", 120)
    user_id, now = user_with_schedules(engine), datetime(2026, 1, 15, 23, tzinfo=UTC)
    with Session(engine) as db:
        db.add(LearningStreak(user_id=user_id, current_streak=4, longest_streak=7,
            last_qualifying_local_date=now.date() - timedelta(days=1),
            last_qualifying_activity_at=now - timedelta(days=1), streak_timezone="UTC"))
        schedule_id = streak_schedule(db, user_id).id
        db.commit()
    with Session(engine) as db:
        streak = db.get(LearningStreak, user_id)
        before = (streak.current_streak, streak.longest_streak,
                  streak.last_qualifying_local_date, streak.last_qualifying_activity_at)
    correlation = uuid.uuid4()
    assert _evaluate_schedule(schedule_id, "streak_risk", now, correlation) == "evaluated"
    assert _evaluate_schedule(schedule_id, "streak_risk", now, correlation) == "evaluated"
    with Session(engine) as db:
        streak = db.get(LearningStreak, user_id)
        assert (streak.current_streak, streak.longest_streak,
                streak.last_qualifying_local_date, streak.last_qualifying_activity_at) == before
        events = db.scalars(select(EngagementEvent).where(
            EngagementEvent.user_id == user_id,
            EngagementEvent.event_type == "streak.at_risk")).all()
        assert len(events) == 1
        assert events[0].metadata_["engagement_decisions"] == ["analytics"]
        assert db.scalar(select(func.count()).select_from(EmailJob).where(
            EmailJob.user_id == user_id)) == 0
        assert streak_schedule(db, user_id).correlation_id == correlation


def test_no_streak_row_suppresses_without_email(engine, monkeypatch):
    monkeypatch.setattr(settings, "STREAK_RISK_WINDOW_MINUTES", 120)
    user_id, now = user_with_schedules(engine), datetime(2026, 1, 15, 23, tzinfo=UTC)
    with Session(engine) as db:
        schedule_id = streak_schedule(db, user_id).id
    assert _evaluate_schedule(schedule_id, "streak_risk", now, uuid.uuid4()) == "suppressed"
    with Session(engine) as db:
        assert db.scalar(select(func.count()).select_from(EmailJob).where(
            EmailJob.user_id == user_id)) == 0


def test_concurrent_streak_workers_emit_once_and_do_not_mutate_streak(engine, monkeypatch):
    monkeypatch.setattr(settings, "STREAK_RISK_WINDOW_MINUTES", 120)
    user_id, now = user_with_schedules(engine), datetime(2026, 1, 15, 23, tzinfo=UTC)
    with Session(engine) as db:
        db.add(LearningStreak(user_id=user_id, current_streak=2, longest_streak=5,
            last_qualifying_local_date=now.date() - timedelta(days=1),
            last_qualifying_activity_at=now - timedelta(days=1), streak_timezone="UTC"))
        schedule_id = streak_schedule(db, user_id).id
        db.commit()
    barrier, outcomes, correlation = threading.Barrier(2), [], uuid.uuid4()

    def worker():
        barrier.wait()
        outcomes.append(_evaluate_schedule(schedule_id, "streak_risk", now, correlation))

    threads = [threading.Thread(target=worker), threading.Thread(target=worker)]
    [thread.start() for thread in threads]
    [thread.join() for thread in threads]
    with Session(engine) as db:
        streak = db.get(LearningStreak, user_id)
        assert (streak.current_streak, streak.longest_streak,
                streak.last_qualifying_local_date) == (2, 5, now.date() - timedelta(days=1))
        assert db.scalar(select(func.count()).select_from(EngagementEvent).where(
            EngagementEvent.user_id == user_id,
            EngagementEvent.event_type == "streak.at_risk")) == 1
        assert db.scalar(select(func.count()).select_from(EmailJob).where(
            EmailJob.user_id == user_id)) == 0
    assert outcomes == ["evaluated", "evaluated"]


def test_next_local_day_allows_new_streak_risk_evaluation(engine, monkeypatch):
    monkeypatch.setattr(settings, "STREAK_RISK_WINDOW_MINUTES", 120)
    user_id = user_with_schedules(engine)
    first = datetime(2026, 1, 15, 23, tzinfo=UTC)
    with Session(engine) as db:
        db.add(LearningStreak(user_id=user_id, current_streak=2, longest_streak=5,
            last_qualifying_local_date=first.date() - timedelta(days=1),
            last_qualifying_activity_at=first - timedelta(days=1), streak_timezone="UTC"))
        schedule_id = streak_schedule(db, user_id).id
        db.commit()
    assert _evaluate_schedule(schedule_id, "streak_risk", first, uuid.uuid4()) == "evaluated"
    second = first + timedelta(days=1)
    with Session(engine) as db:
        streak = db.get(LearningStreak, user_id)
        streak.last_qualifying_local_date = second.date() - timedelta(days=1)
        streak.last_qualifying_activity_at = second - timedelta(days=1)
        db.commit()
    assert _evaluate_schedule(schedule_id, "streak_risk", second, uuid.uuid4()) == "evaluated"
    with Session(engine) as db:
        assert db.scalar(select(func.count()).select_from(EngagementEvent).where(
            EngagementEvent.user_id == user_id,
            EngagementEvent.event_type == "streak.at_risk")) == 2
        assert db.scalar(select(func.count()).select_from(EmailJob).where(
            EmailJob.user_id == user_id)) == 0
