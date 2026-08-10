"""Real PostgreSQL evidence for Phase 3 indexed automation orchestration."""

import threading
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from config import settings
from models.automation import EngagementAutomationRun, EngagementAutomationSchedule
from models.email import EmailDeliveryLog, EmailJob, EmailSuppression
from models.engagement import (
    EngagementEvent,
    EngagementPreference,
    LearningStreak,
    NudgeState,
)
from models.enums import UserRole
from models.flashcard import FlashcardSet
from models.quiz import QuizResult
from models.user import User
from services.engagement_automation import (
    begin_run,
    claim_due_schedules,
    cleanup_expired,
    next_local_week,
    upsert_user_schedules,
)
from tasks.email_tasks import local_week_key
from tasks.automation_tasks import (
    _evaluate_schedule,
    process_due_email_automation,
    run_candidate_scan,
)


def user_with_schedules(engine, *, due=True, banned=False):
    user_id, now = uuid.uuid4(), datetime.now(UTC)
    with Session(engine) as db:
        user = User(
            id=user_id,
            email=f"automation-{user_id}@example.test",
            hashed_password=None,
            role=UserRole.student,
            full_name="Automation Test",
            preferences={},
            is_banned=banned,
            last_active_at=now - timedelta(days=5),
        )
        db.add(user)
        db.flush()
        db.add(EngagementPreference(user_id=user_id, timezone="UTC"))
        db.flush()
        upsert_user_schedules(db, user, now=now)
        if due:
            db.query(EngagementAutomationSchedule).filter_by(user_id=user_id).update(
                {
                    EngagementAutomationSchedule.next_evaluation_at: now
                    - timedelta(seconds=1)
                }
            )
        db.commit()
    return user_id


def test_concurrent_schedule_claim_is_once_and_not_due_is_excluded(engine):
    user_id, now = user_with_schedules(engine), datetime.now(UTC)
    with Session(engine) as db:
        weekly = db.scalar(
            select(EngagementAutomationSchedule).where(
                EngagementAutomationSchedule.user_id == user_id,
                EngagementAutomationSchedule.automation_type == "weekly_summary",
            )
        )
        weekly.next_evaluation_at = now + timedelta(hours=1)
        db.commit()
    barrier, claimed = threading.Barrier(2), []

    def worker():
        with Session(engine) as db:
            barrier.wait()
            rows = claim_due_schedules(
                db, "inactivity", now=now, limit=10, correlation_id=uuid.uuid4()
            )
            claimed.extend(row.id for row in rows)
            db.commit()

    threads = [threading.Thread(target=worker), threading.Thread(target=worker)]
    [thread.start() for thread in threads]
    [thread.join() for thread in threads]
    assert len(claimed) == 1
    with Session(engine) as db:
        assert (
            claim_due_schedules(
                db, "weekly_summary", now=now, limit=10, correlation_id=uuid.uuid4()
            )
            == []
        )


def test_duplicate_inactivity_run_creates_one_event_and_advances_cursor(engine):
    user_id = user_with_schedules(engine)
    first = run_candidate_scan(
        "inactivity", settings.INACTIVITY_SCAN_INTERVAL_MINUTES * 60
    )
    second = run_candidate_scan(
        "inactivity", settings.INACTIVITY_SCAN_INTERVAL_MINUTES * 60
    )
    assert first["evaluated"] == 1 and second["outcome"] == "no_due_work"
    with Session(engine) as db:
        assert (
            db.scalar(
                select(func.count())
                .select_from(EngagementEvent)
                .where(
                    EngagementEvent.user_id == user_id,
                    EngagementEvent.event_type == "inactivity.eligible",
                )
            )
            == 1
        )
        schedule = db.scalar(
            select(EngagementAutomationSchedule).where(
                EngagementAutomationSchedule.user_id == user_id,
                EngagementAutomationSchedule.automation_type == "inactivity",
            )
        )
        assert schedule.next_evaluation_at > datetime.now(UTC)


def test_streak_risk_does_not_rewrite_streak_or_create_email(engine):
    user_id = user_with_schedules(engine)
    with Session(engine) as db:
        db.add(
            LearningStreak(
                user_id=user_id,
                current_streak=4,
                longest_streak=4,
                last_qualifying_local_date=datetime.now(UTC).date() - timedelta(days=1),
                streak_timezone="UTC",
            )
        )
        db.commit()
    result = run_candidate_scan(
        "streak_risk", settings.STREAK_RISK_SCAN_INTERVAL_MINUTES * 60
    )
    assert result["evaluated"] == 1
    with Session(engine) as db:
        assert db.get(LearningStreak, user_id).current_streak == 4
        assert (
            db.scalar(
                select(func.count())
                .select_from(EmailJob)
                .where(EmailJob.user_id == user_id)
            )
            == 0
        )


def test_backfill_is_idempotent_and_dry_run_does_not_write(engine):
    user_id = user_with_schedules(engine, due=False)
    with Session(engine) as db:
        user = db.get(User, user_id)
        assert upsert_user_schedules(db, user, now=datetime.now(UTC)) == 0
        before = db.scalar(
            select(func.count())
            .select_from(EngagementAutomationSchedule)
            .where(EngagementAutomationSchedule.user_id == user_id)
        )
        assert upsert_user_schedules(db, user, now=datetime.now(UTC), dry_run=True) == 0
        assert before == 3


def test_cleanup_dry_run_and_bounded_delete_preserve_protected_records(
    engine, monkeypatch
):
    user_id = user_with_schedules(engine)
    old = datetime.now(UTC) - timedelta(days=400)
    with Session(engine) as db:
        db.add(
            NudgeState(
                user_id=user_id,
                nudge_key="expired",
                placement="dashboard",
                first_eligible_at=old,
                expires_at=old,
                context={},
            )
        )
        db.add(EmailSuppression(user_id=user_id, scope="global", reason="complaint"))
        db.commit()
    monkeypatch.setattr(settings, "ENGAGEMENT_STATE_RETENTION_DAYS", 30)
    with Session(engine) as db:
        dry = cleanup_expired(db, now=datetime.now(UTC), limit=1, dry_run=True)
        db.commit()
        assert dry["nudge_states"] == 1
        assert (
            db.scalar(
                select(func.count())
                .select_from(NudgeState)
                .where(NudgeState.user_id == user_id)
            )
            == 1
        )
    with Session(engine) as db:
        deleted = cleanup_expired(db, now=datetime.now(UTC), limit=1, dry_run=False)
        db.commit()
        assert deleted["nudge_states"] == 1
        assert (
            db.scalar(
                select(func.count())
                .select_from(EmailSuppression)
                .where(EmailSuppression.user_id == user_id)
            )
            == 1
        )


def test_duplicate_run_history_is_one_row(engine):
    correlation = uuid.uuid4()
    with Session(engine) as db:
        first, created = begin_run(
            db, "cleanup", "cleanup:bucket", correlation, "worker-a"
        )
        first_id = first.id
        db.commit()
    with Session(engine) as db:
        second, duplicate_created = begin_run(
            db, "cleanup", "cleanup:bucket", correlation, "worker-b"
        )
        db.commit()
        second_id = second.id
    assert created and not duplicate_created and first_id == second_id


def test_weekly_payload_and_correlation_use_authoritative_postgres_data(
    engine, monkeypatch
):
    user_id = user_with_schedules(engine)
    now, correlation = datetime.now(UTC), uuid.uuid4()
    monkeypatch.setattr(settings, "ENGAGEMENT_LIFECYCLE_EMAILS_ENABLED", True)
    with Session(engine) as db:
        studied_set = FlashcardSet(
            user_id=user_id,
            title="Authoritative set",
            description=None,
            tags=[],
        )
        previous_set = FlashcardSet(
            user_id=user_id,
            title="Previous set",
            description=None,
            tags=[],
        )
        db.add_all([studied_set, previous_set])
        db.flush()
        studied_set_id = studied_set.id
        db.add_all(
            [
                QuizResult(
                    user_id=user_id,
                    set_id=studied_set.id,
                    score=8,
                    total_questions=10,
                    time_taken_seconds=125,
                    completed_at=now - timedelta(hours=1),
                    extras={},
                ),
                QuizResult(
                    user_id=user_id,
                    set_id=previous_set.id,
                    score=5,
                    total_questions=10,
                    time_taken_seconds=60,
                    completed_at=now - timedelta(days=8),
                    extras={},
                ),
            ]
        )
        weekly = db.scalar(
            select(EngagementAutomationSchedule).where(
                EngagementAutomationSchedule.user_id == user_id,
                EngagementAutomationSchedule.automation_type == "weekly_summary",
            )
        )
        schedule_id = weekly.id
        db.commit()

    assert _evaluate_schedule(schedule_id, "weekly_summary", now, correlation) == "scheduled"
    local_period = (now.date() - timedelta(days=now.weekday())).isoformat()
    with Session(engine) as db:
        job = db.scalar(select(EmailJob).where(EmailJob.user_id == user_id))
        event = db.get(EngagementEvent, job.engagement_event_id)
        schedule = db.get(EngagementAutomationSchedule, schedule_id)
        scheduling_log = db.scalar(
            select(EmailDeliveryLog).where(EmailDeliveryLog.email_job_id == job.id)
        )
        assert job.deduplication_key == f"weekly:{user_id}:{local_period}"
        assert job.correlation_id == correlation
        assert schedule.correlation_id == correlation
        assert event.metadata_["correlation_id"] == str(correlation)
        assert scheduling_log.correlation_id == correlation
        assert job.payload["metrics"] == {
            "units_completed": 1,
            "learning_minutes": 2,
            "assessments_completed": 1,
            "assessment_average": 80.0,
            "current_streak": 1,
        }
        assert job.payload["change_from_previous"]["units_completed"] == 0
        assert job.payload["change_from_previous"]["learning_minutes"] == 1
        assert job.payload["suggested_next_action"] == {
            "type": "review_set",
            "entity_id": str(studied_set_id),
            "label": "Authoritative set",
        }


def test_empty_week_suppresses_job_and_advances_cursor(engine, monkeypatch):
    user_id = user_with_schedules(engine)
    now = datetime.now(UTC)
    monkeypatch.setattr(settings, "ENGAGEMENT_LIFECYCLE_EMAILS_ENABLED", True)
    with Session(engine) as db:
        schedule = db.scalar(
            select(EngagementAutomationSchedule).where(
                EngagementAutomationSchedule.user_id == user_id,
                EngagementAutomationSchedule.automation_type == "weekly_summary",
            )
        )
        schedule_id = schedule.id
        db.commit()
    assert _evaluate_schedule(schedule_id, "weekly_summary", now, uuid.uuid4()) == "suppressed"
    with Session(engine) as db:
        assert db.scalar(select(func.count()).select_from(EmailJob).where(EmailJob.user_id == user_id)) == 0
        assert db.get(EngagementAutomationSchedule, schedule_id).next_evaluation_at > now


@pytest.mark.parametrize(
    ("timezone_name", "instant", "period", "next_run"),
    [
        ("UTC", "2024-11-03T12:00:00+00:00", "2024-10-28", "2024-11-04T09:00:00+00:00"),
        ("Africa/Freetown", "2024-11-03T12:00:00+00:00", "2024-10-28", "2024-11-04T09:00:00+00:00"),
        ("Asia/Tokyo", "2024-11-03T16:00:00+00:00", "2024-11-04", "2024-11-11T00:00:00+00:00"),
        ("America/New_York", "2024-03-10T12:00:00+00:00", "2024-03-04", "2024-03-11T13:00:00+00:00"),
        ("America/New_York", "2024-11-03T12:00:00+00:00", "2024-10-28", "2024-11-04T14:00:00+00:00"),
        ("Pacific/Honolulu", "2024-11-04T05:00:00+00:00", "2024-10-28", "2024-11-04T19:00:00+00:00"),
        ("Europe/London", "2024-03-31T12:00:00+00:00", "2024-03-25", "2024-04-01T08:00:00+00:00"),
        ("Not/A-Timezone", "2024-11-03T12:00:00+00:00", "2024-10-28", "2024-11-04T09:00:00+00:00"),
    ],
)
def test_local_reporting_week_boundaries(engine, timezone_name, instant, period, next_run):
    now = datetime.fromisoformat(instant)
    # The engine fixture makes this a PostgreSQL integration case while the
    # assertions pin the calendar logic at UTC/local-week and DST boundaries.
    assert local_week_key(now, timezone_name) == period
    assert next_local_week(now, timezone_name) == datetime.fromisoformat(next_run)


def test_concurrent_weekly_execution_is_idempotent_and_cursor_advances_once(engine, monkeypatch):
    user_id, now = user_with_schedules(engine), datetime.now(UTC)
    monkeypatch.setattr(settings, "ENGAGEMENT_LIFECYCLE_EMAILS_ENABLED", True)
    with Session(engine) as db:
        card_set = FlashcardSet(user_id=user_id, title="Concurrent", description=None, tags=[])
        db.add(card_set)
        db.flush()
        db.add(QuizResult(user_id=user_id, set_id=card_set.id, score=1,
                          total_questions=1, time_taken_seconds=60,
                          completed_at=now - timedelta(minutes=1), extras={}))
        schedule = db.scalar(select(EngagementAutomationSchedule).where(
            EngagementAutomationSchedule.user_id == user_id,
            EngagementAutomationSchedule.automation_type == "weekly_summary"))
        schedule_id = schedule.id
        db.commit()
    barrier, outcomes = threading.Barrier(2), []
    correlation = uuid.uuid4()

    def worker():
        barrier.wait()
        outcomes.append(_evaluate_schedule(schedule_id, "weekly_summary", now, correlation))

    threads = [threading.Thread(target=worker), threading.Thread(target=worker)]
    [thread.start() for thread in threads]
    [thread.join() for thread in threads]
    with Session(engine) as db:
        assert db.scalar(select(func.count()).select_from(EngagementEvent).where(
            EngagementEvent.user_id == user_id,
            EngagementEvent.event_type == "weekly_summary.eligible")) == 1
        assert db.scalar(select(func.count()).select_from(EmailJob).where(
            EmailJob.user_id == user_id)) == 1
        schedule = db.get(EngagementAutomationSchedule, schedule_id)
        assert schedule.last_evaluated_at == now
        assert schedule.correlation_id == correlation
    assert outcomes == ["scheduled", "scheduled"]


def test_same_and_next_local_period_logical_idempotency(engine, monkeypatch):
    user_id, now = user_with_schedules(engine), datetime.now(UTC)
    monkeypatch.setattr(settings, "ENGAGEMENT_LIFECYCLE_EMAILS_ENABLED", True)
    with Session(engine) as db:
        card_set = FlashcardSet(user_id=user_id, title="Periods", description=None, tags=[])
        db.add(card_set)
        db.flush()
        db.add(QuizResult(user_id=user_id, set_id=card_set.id, score=1,
                          total_questions=1, time_taken_seconds=60,
                          completed_at=now, extras={}))
        schedule = db.scalar(select(EngagementAutomationSchedule).where(
            EngagementAutomationSchedule.user_id == user_id,
            EngagementAutomationSchedule.automation_type == "weekly_summary"))
        schedule_id = schedule.id
        db.commit()
    _evaluate_schedule(schedule_id, "weekly_summary", now, uuid.uuid4())
    _evaluate_schedule(schedule_id, "weekly_summary", now + timedelta(hours=1), uuid.uuid4())
    _evaluate_schedule(schedule_id, "weekly_summary", now + timedelta(days=7), uuid.uuid4())
    with Session(engine) as db:
        assert db.scalar(select(func.count()).select_from(EngagementEvent).where(
            EngagementEvent.user_id == user_id,
            EngagementEvent.event_type == "weekly_summary.eligible")) == 2
        assert db.scalar(select(func.count()).select_from(EmailJob).where(
            EmailJob.user_id == user_id)) == 2


def test_stale_running_run_is_recovered_without_changing_correlation(engine, monkeypatch):
    correlation, key = uuid.uuid4(), f"stale:{uuid.uuid4()}"
    with Session(engine) as db:
        run, created = begin_run(db, "due_email", key, correlation, "dead-worker")
        run.started_at = datetime.now(UTC) - timedelta(days=1)
        run_id = run.id
        db.commit()
    with Session(engine) as db:
        recovered, created = begin_run(db, "due_email", key, uuid.uuid4(), "new-worker")
        db.commit()
        assert created
        assert recovered.id == run_id
        assert recovered.correlation_id == correlation
        assert recovered.worker_id == "new-worker"


def test_due_email_run_is_bounded_partial_then_processes_remainder(engine, monkeypatch):
    import tasks.automation_tasks as automation_tasks

    class ControlledDateTime(datetime):
        current = datetime.now(UTC)

        @classmethod
        def now(cls, tz=None):
            return cls.current if tz else cls.current.replace(tzinfo=None)

    monkeypatch.setattr(automation_tasks, "datetime", ControlledDateTime)
    user_id, due = user_with_schedules(engine), datetime.now(UTC) - timedelta(minutes=1)
    with Session(engine) as db:
        for index in range(6):
            key = f"batch-one:{user_id}:{index}"
            db.add(EmailJob(user_id=user_id, template_key="welcome", template_version="v1",
                category="welcome", classification="transactional_lifecycle", status="pending",
                priority=index, scheduled_for=due, next_attempt_at=due, retry_count=0,
                max_retries=2, idempotency_key=key, deduplication_key=key,
                payload={"recipient_verified": True}, correlation_id=uuid.uuid4()))
        db.commit()
    monkeypatch.setattr(settings, "ENGAGEMENT_AUTOMATION_ENABLED", True)
    monkeypatch.setattr(settings, "EMAIL_JOB_BATCH_SIZE", 2)
    monkeypatch.setattr(settings, "AUTOMATION_MAX_BATCHES_PER_RUN", 2)

    def fake_batch():
        with Session(engine) as db:
            jobs = db.scalars(select(EmailJob).where(
                EmailJob.user_id == user_id, EmailJob.status == "pending",
                EmailJob.next_attempt_at <= datetime.now(UTC)).order_by(EmailJob.priority).limit(2)).all()
            for job in jobs:
                job.status, job.sent_at = "sent", datetime.now(UTC)
            db.commit()
        return {"claimed": len(jobs), "sent": len(jobs), "suppressed": 0,
                "cancelled": 0, "retried": 0, "dead_letter": 0,
                "attempt_outcomes": []}

    import tasks.email_tasks as email_tasks
    monkeypatch.setattr(email_tasks, "process_lifecycle_email_jobs_with_provider", fake_batch)
    first = process_due_email_automation()
    assert first["claimed"] == 4 and first["remaining_due"] == 2
    assert first["outcome"] == "partially_processed"
    with Session(engine) as db:
        first_run = db.scalar(select(EngagementAutomationRun).order_by(
            EngagementAutomationRun.started_at.desc()))
        assert first_run.status == "partially_completed"
        assert first_run.remaining_due_count == 2
    # Model the next Beat interval without sleeping or modifying run history.
    ControlledDateTime.current += timedelta(seconds=settings.EMAIL_PROCESSOR_INTERVAL_SECONDS)
    second = process_due_email_automation()
    assert second["claimed"] == 2 and second["remaining_due"] == 0
    assert second["outcome"] == "processed"
    with Session(engine) as db:
        assert db.scalar(select(func.count()).select_from(EmailJob).where(
            EmailJob.user_id == user_id, EmailJob.status == "sent")) == 6


def test_due_email_timeout_and_disabled_status_mapping(engine, monkeypatch):
    import tasks.automation_tasks as automation_tasks

    monkeypatch.setattr(settings, "ENGAGEMENT_AUTOMATION_ENABLED", True)
    monkeypatch.setattr(settings, "AUTOMATION_TASK_SOFT_TIME_LIMIT_SECONDS", 5)
    ticks = iter((0.0, 6.0))
    monkeypatch.setattr(automation_tasks.monotonic_time, "monotonic", lambda: next(ticks))
    result = process_due_email_automation()
    assert result["outcome"] == "timed_out"
    with Session(engine) as db:
        run = db.scalar(select(EngagementAutomationRun).order_by(
            EngagementAutomationRun.started_at.desc()))
        assert run.status == "timed_out" and run.completed_at is not None
        run.idempotency_key = f"timed:{run.idempotency_key}"
        db.commit()
    monkeypatch.setattr(settings, "ENGAGEMENT_AUTOMATION_ENABLED", False)
    result = process_due_email_automation()
    assert result["outcome"] == "no_due_work"
    with Session(engine) as db:
        run = db.scalar(select(EngagementAutomationRun).order_by(
            EngagementAutomationRun.started_at.desc()))
        assert run.status == "cancelled" and run.completed_at is not None
