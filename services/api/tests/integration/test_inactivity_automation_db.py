"""Batch 2 PostgreSQL evidence for inactivity automation."""

import threading
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from config import settings
from models.automation import EngagementAutomationRun, EngagementAutomationSchedule
from models.email import EmailJob
from models.engagement import EngagementEvent, EngagementPreference
from models.user import User
from services.engagement_automation import claim_due_schedules
from tasks.automation_tasks import _evaluate_schedule, run_candidate_scan
from tests.integration.test_engagement_automation_db import user_with_schedules

def inactivity_schedule(db, user_id):
    return db.scalar(select(EngagementAutomationSchedule).where(
        EngagementAutomationSchedule.user_id == user_id,
        EngagementAutomationSchedule.automation_type == "inactivity"))


def test_new_activity_before_evaluation_uses_authoritative_cursor(engine):
    user_id, now = user_with_schedules(engine), datetime.now(UTC)
    latest = now - timedelta(minutes=2)
    with Session(engine) as db:
        db.get(User, user_id).last_active_at = latest
        schedule_id = inactivity_schedule(db, user_id).id
        db.commit()
    correlation = uuid.uuid4()
    assert _evaluate_schedule(schedule_id, "inactivity", now, correlation) == "suppressed"
    with Session(engine) as db:
        schedule = db.get(EngagementAutomationSchedule, schedule_id)
        assert schedule.next_evaluation_at == latest + timedelta(hours=settings.INACTIVITY_THRESHOLD_HOURS)
        assert schedule.last_evaluated_at == now and schedule.locked_at is None
        assert schedule.correlation_id == correlation
        assert db.scalar(select(func.count()).select_from(EngagementEvent).where(
            EngagementEvent.user_id == user_id,
            EngagementEvent.event_type == "inactivity.eligible")) == 0
        assert db.scalar(select(func.count()).select_from(EmailJob).where(
            EmailJob.user_id == user_id)) == 0


def test_new_activity_after_claim_is_rechecked_and_releases_lease(engine):
    user_id, now, correlation = user_with_schedules(engine), datetime.now(UTC), uuid.uuid4()
    with Session(engine) as db:
        claimed = claim_due_schedules(db, "inactivity", now=now, limit=1,
                                      correlation_id=correlation)
        schedule_id = claimed[0].id
        db.commit()
    latest = now - timedelta(seconds=1)
    with Session(engine) as db:
        db.get(User, user_id).last_active_at = latest
        db.commit()
    assert _evaluate_schedule(schedule_id, "inactivity", now, correlation) == "suppressed"
    with Session(engine) as db:
        schedule = db.get(EngagementAutomationSchedule, schedule_id)
        assert schedule.locked_at is None and schedule.correlation_id == correlation
        assert schedule.next_evaluation_at == latest + timedelta(hours=settings.INACTIVITY_THRESHOLD_HOURS)
        assert db.scalar(select(func.count()).select_from(EngagementEvent).where(
            EngagementEvent.user_id == user_id,
            EngagementEvent.event_type == "inactivity.eligible")) == 0
        assert db.scalar(select(func.count()).select_from(EmailJob).where(
            EmailJob.user_id == user_id)) == 0


def test_inactivity_account_state_and_timezone_safety(engine):
    active, banned, now = user_with_schedules(engine), user_with_schedules(engine, banned=True), datetime.now(UTC)
    with Session(engine) as db:
        db.get(EngagementPreference, active).timezone = "invalid/timezone"
        active_schedule = inactivity_schedule(db, active).id
        # A banned user is not provisioned; model an existing cursor disabled by evaluation.
        banned_user = db.get(User, banned)
        assert banned_user is not None
        banned_schedule = inactivity_schedule(db, banned)
        assert banned_schedule is None
        db.commit()
    assert _evaluate_schedule(active_schedule, "inactivity", now, uuid.uuid4()) == "evaluated"
    with Session(engine) as db:
        assert db.scalar(select(func.count()).select_from(EmailJob).where(
            EmailJob.user_id == active)) == 0


def test_two_inactivity_workers_create_one_event_and_no_email(engine):
    user_id, now, correlation = user_with_schedules(engine), datetime.now(UTC), uuid.uuid4()
    with Session(engine) as db:
        schedule_id = inactivity_schedule(db, user_id).id
    barrier, outcomes = threading.Barrier(2), []

    def worker():
        barrier.wait()
        outcomes.append(_evaluate_schedule(schedule_id, "inactivity", now, correlation))

    threads = [threading.Thread(target=worker), threading.Thread(target=worker)]
    [thread.start() for thread in threads]
    [thread.join() for thread in threads]
    with Session(engine) as db:
        assert db.scalar(select(func.count()).select_from(EngagementEvent).where(
            EngagementEvent.user_id == user_id,
            EngagementEvent.event_type == "inactivity.eligible")) == 1
        assert db.scalar(select(func.count()).select_from(EmailJob).where(
            EmailJob.user_id == user_id)) == 0
        assert inactivity_schedule(db, user_id).last_evaluated_at == now
    assert outcomes == ["evaluated", "evaluated"]


def test_inactivity_item_failure_isolated_with_exact_run_counters(engine, monkeypatch):
    import tasks.automation_tasks as automation_tasks

    good_active = user_with_schedules(engine)
    good_inactive = user_with_schedules(engine)
    malformed = user_with_schedules(engine)
    disabled = user_with_schedules(engine)
    now = datetime.now(UTC)
    with Session(engine) as db:
        db.get(User, good_active).last_active_at = now
        inactivity_schedule(db, disabled).status = "disabled"
        malformed_schedule = inactivity_schedule(db, malformed).id
        db.commit()
    original = automation_tasks._evaluate_schedule

    def controlled(schedule_id, automation_type, evaluated_at, correlation_id):
        if schedule_id == malformed_schedule:
            raise ValueError("malformed activity")
        return original(schedule_id, automation_type, evaluated_at, correlation_id)

    monkeypatch.setattr(automation_tasks, "_evaluate_schedule", controlled)
    monkeypatch.setattr(settings, "ENGAGEMENT_AUTOMATION_ENABLED", True)
    result = run_candidate_scan("inactivity", settings.INACTIVITY_SCAN_INTERVAL_MINUTES * 60)
    assert result["claimed"] == 3
    assert result["evaluated"] == 2
    assert result["suppressed"] == 1
    assert result["failed"] == 1
    assert result["outcome"] == "partially_processed"
    with Session(engine) as db:
        run = db.scalar(select(EngagementAutomationRun).where(
            EngagementAutomationRun.automation_type == "inactivity"))
        assert run.status == "partially_completed"
        assert (run.claimed_count, run.evaluated_count, run.suppressed_count,
                run.failed_count, run.scheduled_count) == (3, 2, 1, 1, 0)
        failed = db.get(EngagementAutomationSchedule, malformed_schedule)
        assert failed.failure_count == 1 and failed.locked_at is None
        assert failed.next_evaluation_at > now
        assert db.scalar(select(func.count()).select_from(EmailJob).where(
            EmailJob.user_id.in_((good_active, good_inactive, malformed, disabled)))) == 0


def test_activity_after_inactivity_event_prevents_duplicate_delivery(engine):
    user_id, now = user_with_schedules(engine), datetime.now(UTC)
    with Session(engine) as db:
        schedule_id = inactivity_schedule(db, user_id).id
    assert _evaluate_schedule(schedule_id, "inactivity", now, uuid.uuid4()) == "evaluated"
    with Session(engine) as db:
        db.get(User, user_id).last_active_at = now + timedelta(minutes=1)
        db.commit()
    assert _evaluate_schedule(schedule_id, "inactivity", now + timedelta(minutes=2),
                              uuid.uuid4()) == "suppressed"
    with Session(engine) as db:
        assert db.scalar(select(func.count()).select_from(EngagementEvent).where(
            EngagementEvent.user_id == user_id,
            EngagementEvent.event_type == "inactivity.eligible")) == 1
        assert db.scalar(select(func.count()).select_from(EmailJob).where(
            EmailJob.user_id == user_id)) == 0
