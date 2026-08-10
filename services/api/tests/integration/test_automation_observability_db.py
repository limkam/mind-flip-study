"""Integration evidence for Phase 3 metrics and structured task events."""

from __future__ import annotations

import json
import logging
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from config import settings
from models.automation import EngagementAutomationRun, EngagementAutomationSchedule
from models.engagement import NudgeState
from services.automation_metrics import RecordingMetrics, set_metrics_adapter
from tasks import automation_tasks
from tests.integration.test_engagement_automation_db import user_with_schedules


SENTINELS = (
    "private-user@example.com", "PRIVATE_USER_NAME", "PRIVATE_USER_ID",
    "PRIVATE_FLASHCARD_CONTENT", "PRIVATE_QUIZ_ANSWER", "PRIVATE_DATABASE_PASSWORD",
    "PRIVATE_API_KEY", "PRIVATE_WEBHOOK_SECRET", "PRIVATE_UNSUBSCRIBE_TOKEN",
    "PRIVATE_SCORECARD_SHARE_TOKEN", "/private/internal/path",
)


class ControlledDateTime(datetime):
    current = datetime(2035, 1, 1, tzinfo=UTC)

    @classmethod
    def now(cls, tz=None):
        return cls.current if tz else cls.current.replace(tzinfo=None)


@pytest.fixture
def observability(engine, monkeypatch, caplog):
    recording = RecordingMetrics()
    previous = set_metrics_adapter(recording)
    monkeypatch.setattr(automation_tasks, "datetime", ControlledDateTime)
    monkeypatch.setattr(settings, "ENGAGEMENT_AUTOMATION_ENABLED", True)
    caplog.set_level(logging.INFO, logger="engagement.automation")
    yield engine, recording, caplog
    set_metrics_adapter(previous)


def _advance(seconds=3600):
    ControlledDateTime.current += timedelta(seconds=seconds)


def _events(caplog):
    result = []
    for record in caplog.records:
        if record.name == "engagement.automation" and "automation_event " in record.message:
            result.append(json.loads(record.message.split("automation_event ", 1)[1]))
    return result


def _metric(recording, name, **labels):
    return [event for event in recording.events
            if event.name == name and event.labels == labels]


def _due_schedule(engine, automation_type):
    with Session(engine) as db:
        for row in db.scalars(select(EngagementAutomationSchedule).where(
                EngagementAutomationSchedule.automation_type == automation_type)).all():
            row.next_evaluation_at = ControlledDateTime.current + timedelta(days=30)
            row.locked_at = None
        db.commit()
    user_id = user_with_schedules(engine)
    with Session(engine) as db:
        rows = db.scalars(select(EngagementAutomationSchedule).where(
            EngagementAutomationSchedule.user_id == user_id)).all()
        for row in rows:
            row.next_evaluation_at = (
                ControlledDateTime.current - timedelta(seconds=10)
                if row.automation_type == automation_type
                else ControlledDateTime.current + timedelta(days=30)
            )
        db.commit()
    return user_id


def test_candidate_metrics_exact_values_labels_and_partial_timeout_logs(
        observability, monkeypatch):
    engine, recording, caplog = observability

    _due_schedule(engine, "weekly_summary")
    monkeypatch.setattr(automation_tasks, "_evaluate_schedule",
                        lambda *_args, **_kwargs: "scheduled")
    weekly = automation_tasks.run_candidate_scan("weekly_summary", 3600)
    assert weekly["scheduled"] == 1
    assert len(_metric(recording, "engagement_actions_scheduled_total", value=1)) == 0
    scheduled = _metric(recording, "engagement_actions_scheduled_total",
        automation_type="weekly_summary", journey="weekly_summary",
        action_type="email", outcome="scheduled")
    assert len(scheduled) == 1 and scheduled[0].value == 1

    _advance()
    _due_schedule(engine, "weekly_summary")
    monkeypatch.setattr(automation_tasks, "_evaluate_schedule",
                        lambda *_args, **_kwargs: "suppressed")
    empty = automation_tasks.run_candidate_scan("weekly_summary", 3600)
    assert empty["suppressed"] == 1
    suppressed = _metric(recording, "engagement_actions_suppressed_total",
        automation_type="weekly_summary", journey="weekly_summary",
        action_type="evaluation", outcome="suppressed")
    assert len(suppressed) == 1 and suppressed[0].value == 1
    assert len(scheduled) == 1

    _advance()
    partial_users = [user_with_schedules(engine) for _ in range(2)]
    with Session(engine) as db:
        rows = db.scalars(select(EngagementAutomationSchedule).where(
            EngagementAutomationSchedule.user_id.in_(partial_users),
            EngagementAutomationSchedule.automation_type == "inactivity")).all()
        for row in rows:
            row.next_evaluation_at = ControlledDateTime.current - timedelta(seconds=10)
            row.locked_at = None
        db.commit()
    calls = iter(("evaluated", RuntimeError("PRIVATE_FLASHCARD_CONTENT")))

    def partial(*_args, **_kwargs):
        value = next(calls)
        if isinstance(value, Exception):
            raise value
        return value

    monkeypatch.setattr(automation_tasks, "_evaluate_schedule", partial)
    partial_result = automation_tasks.run_candidate_scan("inactivity", 3600)
    assert partial_result["failed"] == 1
    partial_log = [e for e in _events(caplog) if e["event"] == "task_partially_completed"][-1]
    with Session(engine) as db:
        run = db.scalar(select(EngagementAutomationRun).where(
            EngagementAutomationRun.idempotency_key == partial_log["idempotency_key"]))
        assert partial_log["failed_count"] == run.failed_count == 1
        assert partial_log["evaluated_count"] == run.evaluated_count == 1

    _advance()
    _due_schedule(engine, "streak_risk")
    monkeypatch.setattr(automation_tasks, "_evaluate_schedule",
                        lambda *_args, **_kwargs: "evaluated")
    streak = automation_tasks.run_candidate_scan("streak_risk", 3600)
    assert streak["evaluated"] == 1 and streak["failed"] == 0

    _advance()
    monkeypatch.setattr(settings, "AUTOMATION_TASK_SOFT_TIME_LIMIT_SECONDS", 0)
    timed = automation_tasks.run_candidate_scan("streak_risk", 3600)
    assert timed["outcome"] == "timed_out"
    timeouts = _metric(recording, "engagement_worker_timeouts_total",
                       automation_type="streak_risk", outcome="timed_out")
    assert len(timeouts) == 1 and timeouts[0].value == 1
    timeout_log = [e for e in _events(caplog) if e["event"] == "task_timed_out"][-1]
    with Session(engine) as db:
        run = db.scalar(select(EngagementAutomationRun).where(
            EngagementAutomationRun.idempotency_key == timeout_log["idempotency_key"]))
        assert run.status == "timed_out"

    names = {event.name for event in recording.events}
    assert {"engagement_candidates_evaluated_total", "engagement_candidate_age_seconds",
            "engagement_database_batch_duration_seconds",
            "engagement_phase1_evaluation_duration_seconds",
            "engagement_automation_task_duration_seconds"} <= names


def test_due_email_metrics_outcomes_conflict_no_work_and_logs(observability, monkeypatch):
    engine, recording, caplog = observability
    import tasks.email_tasks as email_tasks

    outcomes = iter((
        {"claimed": 1, "sent": 1, "suppressed": 0, "cancelled": 0,
         "retried": 0, "dead_letter": 0, "queue_delays": [12.5],
         "attempt_outcomes": [{"journey": "welcome", "attempt_type": "first",
             "outcome": "delivered", "failure_category": "none"}]},
        {"claimed": 1, "sent": 1, "suppressed": 0, "cancelled": 0,
         "retried": 1, "dead_letter": 0, "queue_delays": [30.0],
         "attempt_outcomes": [{"journey": "welcome", "attempt_type": "retry",
             "outcome": "delivered", "failure_category": "none"}]},
        {"claimed": 1, "sent": 0, "suppressed": 0, "cancelled": 1,
         "retried": 0, "dead_letter": 0, "queue_delays": [1.0],
         "attempt_outcomes": [{"journey": "welcome", "attempt_type": "first",
             "outcome": "cancelled", "failure_category": "stale"}]},
        {"claimed": 1, "sent": 0, "suppressed": 0, "cancelled": 0,
         "retried": 0, "dead_letter": 1, "queue_delays": [2.0],
         "attempt_outcomes": [{"journey": "welcome", "attempt_type": "first",
             "outcome": "failed", "failure_category": "permanent"}]},
        {"claimed": 0, "sent": 0, "suppressed": 0, "cancelled": 0,
         "retried": 0, "dead_letter": 0, "queue_delays": [], "attempt_outcomes": []},
    ))
    monkeypatch.setattr(settings, "AUTOMATION_MAX_BATCHES_PER_RUN", 1)
    monkeypatch.setattr(email_tasks, "process_lifecycle_email_jobs_with_provider",
                        lambda: next(outcomes))
    for _ in range(5):
        automation_tasks.process_due_email_automation()
        _advance(60)

    exact = (
        ("engagement_actions_delivered_total", 1, {"automation_type": "due_email",
         "journey": "welcome", "action_type": "email", "attempt_type": "first",
         "outcome": "delivered", "failure_category": "none"}),
        ("engagement_actions_delivered_total", 1, {"automation_type": "due_email",
         "journey": "welcome", "action_type": "email", "attempt_type": "retry",
         "outcome": "delivered", "failure_category": "none"}),
        ("engagement_actions_retried_total", 1, {"automation_type": "due_email",
         "journey": "welcome", "action_type": "email", "attempt_type": "retry",
         "outcome": "delivered", "failure_category": "none"}),
        ("engagement_actions_cancelled_total", 1, {"automation_type": "due_email",
         "journey": "welcome", "action_type": "email", "attempt_type": "first",
         "outcome": "cancelled", "failure_category": "stale"}),
        ("engagement_actions_failed_total", 1, {"automation_type": "due_email",
         "journey": "welcome", "action_type": "email", "attempt_type": "first",
         "outcome": "failed", "failure_category": "permanent"}),
    )
    for name, value, labels in exact:
        found = _metric(recording, name, **labels)
        assert len(found) == 1 and found[0].value == value
    assert sum(e.value for e in recording.events
               if e.name == "engagement_actions_delivered_total") == 2
    delays = [e.value for e in recording.events if e.name == "engagement_queue_delay_seconds"]
    assert delays == [12.5, 30.0, 1.0, 2.0]
    no_work = _metric(recording, "engagement_automation_runs_total",
                      automation_type="due_email", outcome="no_due_work")
    assert len(no_work) == 1 and no_work[0].value == 1

    # Same logical delivery is a claim conflict and cannot emit a second final outcome.
    _advance(-60)
    automation_tasks.process_due_email_automation()
    conflict = _metric(recording, "engagement_worker_claim_conflicts_total",
                       automation_type="due_email", outcome="duplicate_delivery")
    assert len(conflict) == 1 and conflict[0].value == 1
    completed_keys = [e["idempotency_key"] for e in _events(caplog)
                      if e["event"] in {"task_completed", "task_partially_completed"}]
    assert len(completed_keys) == len(set(completed_keys))
    assert any(e["event"] == "task_retrying" for e in _events(caplog))

    _advance(60)
    monkeypatch.setattr(email_tasks, "process_lifecycle_email_jobs_with_provider",
                        lambda: (_ for _ in ()).throw(RuntimeError("PRIVATE_API_KEY")))
    with pytest.raises(RuntimeError):
        automation_tasks.process_due_email_automation()
    failed_log = [e for e in _events(caplog) if e["event"] == "task_failed"][-1]
    assert failed_log["failure_code"] == "unexpected_error"
    with Session(engine) as db:
        failed_run = db.scalar(select(EngagementAutomationRun).where(
            EngagementAutomationRun.idempotency_key == failed_log["idempotency_key"]))
        assert failed_run.status == "failed"


def test_cleanup_backfill_lease_recovery_and_pii_safety(observability, monkeypatch):
    engine, recording, caplog = observability
    monkeypatch.setattr(settings, "ENGAGEMENT_STATE_RETENTION_DAYS", 30)
    monkeypatch.setattr(settings, "AUTOMATION_BATCH_SIZE", 10)
    user_id = user_with_schedules(engine, due=False)
    old = ControlledDateTime.current - timedelta(days=400)
    with Session(engine) as db:
        db.add(NudgeState(user_id=user_id, nudge_key="private-cleanup",
            placement="dashboard", first_eligible_at=old, expires_at=old,
            context={"sentinel": "PRIVATE_QUIZ_ANSWER"}))
        db.commit()
    monkeypatch.setattr(settings, "ENGAGEMENT_CLEANUP_DRY_RUN", False)
    deleted = automation_tasks.cleanup_engagement_automation()
    metric = _metric(recording, "engagement_cleanup_records_total",
        automation_type="cleanup", cleanup_type="retention", outcome="deleted")
    assert sum(deleted.get(key, 0) for key in ("nudge_states", "email_jobs",
        "email_delivery_logs", "provider_events", "automation_runs")) == 1
    assert len(metric) == 1 and metric[0].value == 1

    _advance(86400)
    with Session(engine) as db:
        db.add(NudgeState(user_id=user_id, nudge_key="private-dry-run",
            placement="dashboard", first_eligible_at=old, expires_at=old,
            context={"sentinel": "PRIVATE_FLASHCARD_CONTENT"}))
        db.commit()
    monkeypatch.setattr(settings, "ENGAGEMENT_CLEANUP_DRY_RUN", True)
    automation_tasks.cleanup_engagement_automation()
    dry = _metric(recording, "engagement_cleanup_records_total",
        automation_type="cleanup", cleanup_type="retention", outcome="dry_run")
    assert len(dry) == 1 and dry[0].value == 0

    _advance()
    backfill = automation_tasks.backfill_automation_schedules(dry_run=True)
    progress = [e for e in _events(caplog) if e["event"] == "backfill_progress"][-1]
    with Session(engine) as db:
        run = db.scalar(select(EngagementAutomationRun).where(
            EngagementAutomationRun.idempotency_key == progress["idempotency_key"]))
        assert progress["evaluated_count"] == run.evaluated_count == backfill["evaluated"]

    _advance()
    key = f"inactivity:{int(ControlledDateTime.current.timestamp()) // 3600}"
    correlation = uuid.uuid4()
    with Session(engine) as db:
        db.add(EngagementAutomationRun(id=uuid.uuid4(), automation_type="inactivity",
            idempotency_key=key, correlation_id=correlation, status="running",
            started_at=datetime.now(UTC) - timedelta(days=1),
            worker_id="old-worker"))
        db.commit()
    automation_tasks.run_candidate_scan("inactivity", 3600)
    recovered = [e for e in _events(caplog) if e["event"] == "lease_recovered"]
    assert len(recovered) == 1 and recovered[0]["correlation_id"] == str(correlation)

    names = {event.name for event in recording.events}
    assert "engagement_cleanup_duration_seconds" in names
    allowed = {"automation_type", "journey", "action_type", "attempt_type",
               "outcome", "failure_category", "cleanup_type"}
    assert all(set(event.labels) <= allowed for event in recording.events)
    captured = "\n".join(record.message for record in caplog.records)
    assert not any(value in captured for value in SENTINELS)
    assert "postgresql://" not in captured and "postgresql+asyncpg://" not in captured
    assert "/home/" not in captured and len(captured) < 200_000
