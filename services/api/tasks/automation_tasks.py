"""Bounded Phase 3 orchestration over Phase 1 decisions and Phase 2 delivery."""

from __future__ import annotations

import logging
import socket
import time as monotonic_time
import uuid
from datetime import UTC, datetime, timedelta

from celery.exceptions import SoftTimeLimitExceeded
from sqlalchemy import func, select

from config import settings
from database_sync import sync_session
from emails.stats import compute_weekly_stats
from models.automation import EngagementAutomationRun, EngagementAutomationSchedule
from models.email import EmailJob
from models.engagement import EngagementEvent, EngagementPreference, LearningStreak
from models.user import User
from services.automation_logging import task_event
from services.automation_metrics import increment, observe
from services.engagement import safe_timezone
from services.engagement_automation import (
    advance_schedule,
    begin_run,
    claim_due_schedules,
    cleanup_expired,
    cleanup_remaining_count,
    in_streak_risk_window,
    upsert_user_schedules,
)
from services.engagement_rules import DecisionAction, event_actions
from services.lifecycle_email import schedule_job
from tasks.celery_app import celery

log = logging.getLogger(__name__)


def _bucket(now: datetime, seconds: int) -> int:
    return int(now.timestamp()) // seconds


def _task_options() -> dict:
    return {
        "autoretry_for": (ConnectionError,),
        "retry_backoff": True,
        "retry_backoff_max": 300,
        "retry_jitter": True,
        "max_retries": 3,
        "soft_time_limit": settings.AUTOMATION_TASK_SOFT_TIME_LIMIT_SECONDS,
        "time_limit": settings.AUTOMATION_TASK_TIME_LIMIT_SECONDS,
    }


def _finish_run(
    run_id: uuid.UUID,
    counts: dict[str, int],
    status: str = "completed",
    error: tuple[str, str] | None = None,
) -> None:
    with sync_session() as db:
        run = db.get(EngagementAutomationRun, run_id, with_for_update=True)
        if not run:
            return
        run.status, run.completed_at = status, datetime.now(UTC)
        for key in (
            "batch_count",
            "claimed_count",
            "evaluated_count",
            "scheduled_count",
            "suppressed_count",
            "cancelled_count",
            "retried_count",
            "failed_count",
            "skipped_count",
            "remaining_due_count",
        ):
            setattr(
                run, key, counts.get(key.removesuffix("_count"), counts.get(key, 0))
            )
        if error:
            run.last_error_code, run.last_error_message = error[0], error[1][:500]


@celery.task(
    name="tasks.automation_tasks.process_due_email_automation", **_task_options()
)
def process_due_email_automation() -> dict:
    from tasks.email_tasks import process_lifecycle_email_jobs_with_provider

    now, correlation_id = datetime.now(UTC), uuid.uuid4()
    key = f"email-batch:{_bucket(now, settings.EMAIL_PROCESSOR_INTERVAL_SECONDS)}"
    with sync_session() as db:
        run, created = begin_run(
            db, "due_email", key, correlation_id, socket.gethostname()
        )
        run_id = run.id
    task_event("task_started", automation_type="due_email", task_name="process_due_email_automation",
               idempotency_key=key, correlation_id=correlation_id, worker_id=socket.gethostname(), outcome="running")
    if not created:
        increment("engagement_worker_claim_conflicts_total", automation_type="due_email",
                  outcome="duplicate_delivery")
        return {"outcome": "no_due_work", "idempotency_key": key}
    if not settings.ENGAGEMENT_AUTOMATION_ENABLED:
        _finish_run(run_id, {}, "cancelled")
        increment("engagement_actions_cancelled_total", automation_type="due_email",
                  journey="due_email", action_type="task", outcome="disabled")
        return {"outcome": "no_due_work", "idempotency_key": key}
    total = {
        "batch": 0,
        "claimed": 0,
        "scheduled": 0,
        "suppressed": 0,
        "cancelled": 0,
        "retried": 0,
        "failed": 0,
    }
    started = monotonic_time.monotonic()
    try:
        for batch in range(settings.AUTOMATION_MAX_BATCHES_PER_RUN):
            if (
                monotonic_time.monotonic() - started
                >= settings.AUTOMATION_TASK_SOFT_TIME_LIMIT_SECONDS
            ):
                _finish_run(run_id, total, "timed_out")
                increment("engagement_worker_timeouts_total", automation_type="due_email",
                          outcome="timed_out")
                task_event("task_timed_out", automation_type="due_email",
                    task_name="process_due_email_automation", idempotency_key=key,
                    correlation_id=correlation_id, worker_id=socket.gethostname(),
                    batch_number=total["batch"], outcome="timed_out")
                return {**total, "outcome": "timed_out"}
            task_event("batch_started", automation_type="due_email",
                task_name="process_due_email_automation", idempotency_key=key,
                correlation_id=correlation_id, worker_id=socket.gethostname(),
                batch_number=batch + 1, outcome="running")
            batch_started = monotonic_time.monotonic()
            result = process_lifecycle_email_jobs_with_provider()
            for queue_delay in result.get("queue_delays", []):
                observe("engagement_queue_delay_seconds", queue_delay,
                        automation_type="due_email", outcome="claimed")
            observe("engagement_database_batch_duration_seconds",
                    monotonic_time.monotonic() - batch_started,
                    automation_type="due_email", outcome="completed")
            total["batch"] += 1
            for key_name in ("claimed", "suppressed", "cancelled", "retried"):
                total[key_name] += result.get(key_name, 0)
            total["scheduled"] += result.get("sent", 0)
            total["failed"] += result.get("dead_letter", 0)
            for attempt in result.get("attempt_outcomes", []):
                common = {"automation_type": "due_email", "journey": attempt["journey"],
                    "action_type": "email", "attempt_type": attempt["attempt_type"],
                    "outcome": attempt["outcome"], "failure_category": attempt["failure_category"]}
                if attempt["attempt_type"] == "retry":
                    increment("engagement_actions_retried_total", **common)
                    task_event("task_retrying", automation_type="due_email",
                        task_name="process_due_email_automation", idempotency_key=key,
                        correlation_id=correlation_id, worker_id=socket.gethostname(),
                        batch_number=total["batch"], retried_count=1,
                        outcome=attempt["outcome"],
                        failure_code=attempt["failure_category"])
                metric = {"delivered": "engagement_actions_delivered_total",
                    "failed": "engagement_actions_failed_total",
                    "suppressed": "engagement_actions_suppressed_total",
                    "cancelled": "engagement_actions_cancelled_total"}.get(attempt["outcome"])
                if metric:
                    increment(metric, **common)
            task_event("batch_completed", automation_type="due_email",
                task_name="process_due_email_automation", idempotency_key=key,
                correlation_id=correlation_id, worker_id=socket.gethostname(),
                batch_number=total["batch"], claimed_count=result.get("claimed", 0),
                suppressed_count=result.get("suppressed", 0),
                cancelled_count=result.get("cancelled", 0),
                retried_count=result.get("retried", 0),
                failed_count=result.get("dead_letter", 0), outcome="completed")
            if result.get("claimed", 0) == 0:
                break
        with sync_session() as db:
            remaining = int(
                db.scalar(
                    select(func.count())
                    .select_from(EmailJob)
                    .where(
                        EmailJob.status == "pending",
                        EmailJob.next_attempt_at <= datetime.now(UTC),
                    )
                )
                or 0
            )
        outcome = (
            "partially_processed"
            if remaining
            else ("processed" if total["claimed"] else "no_due_work")
        )
        total["remaining_due"] = remaining
        _finish_run(run_id, total, "partially_completed" if remaining else "completed")
        increment(
            "engagement_automation_runs_total",
            automation_type="due_email",
            outcome=outcome,
        )
        duration = monotonic_time.monotonic() - started
        observe("engagement_automation_task_duration_seconds", duration,
                automation_type="due_email", outcome=outcome)
        task_event("task_partially_completed" if remaining else "task_completed",
            automation_type="due_email", task_name="process_due_email_automation", idempotency_key=key,
            correlation_id=correlation_id, worker_id=socket.gethostname(), batch_number=total["batch"],
            claimed_count=total["claimed"], scheduled_count=total["scheduled"],
            suppressed_count=total["suppressed"], cancelled_count=total["cancelled"],
            retried_count=total["retried"], failed_count=total["failed"], remaining_due_count=remaining,
            outcome=outcome, duration_ms=round(duration * 1000, 2))
        return {
            **total,
            "remaining_due": remaining,
            "outcome": outcome,
            "correlation_id": str(correlation_id),
        }
    except SoftTimeLimitExceeded:
        _finish_run(
            run_id, total, "timed_out", ("task_timeout", "soft time limit exceeded")
        )
        increment("engagement_worker_timeouts_total", automation_type="due_email",
                  outcome="timed_out")
        task_event("task_timed_out", automation_type="due_email",
            task_name="process_due_email_automation", idempotency_key=key,
            correlation_id=correlation_id, worker_id=socket.gethostname(),
            outcome="timed_out", failure_code="task_timeout")
        raise
    except Exception as exc:
        _finish_run(run_id, total, "failed", ("unexpected_error", type(exc).__name__))
        increment("engagement_actions_failed_total", automation_type="due_email",
                  journey="due_email", action_type="task", attempt_type="unknown",
                  outcome="failed", failure_category="unexpected_error")
        task_event("task_failed", automation_type="due_email",
            task_name="process_due_email_automation", idempotency_key=key,
            correlation_id=correlation_id, worker_id=socket.gethostname(),
            outcome="failed", failure_code="unexpected_error")
        raise


def _evaluate_schedule(
    schedule_id: uuid.UUID,
    automation_type: str,
    now: datetime,
    correlation_id: uuid.UUID,
) -> str:
    with sync_session() as db:
        schedule = db.get(
            EngagementAutomationSchedule, schedule_id, with_for_update=True
        )
        user = db.get(User, schedule.user_id) if schedule else None
        if not schedule or schedule.status != "active" or not user or user.is_banned:
            if schedule:
                schedule.status = "disabled"
            return "skipped"
        schedule.correlation_id = correlation_id
        prefs = db.get(EngagementPreference, user.id) or EngagementPreference(
            user_id=user.id
        )
        timezone_name = prefs.timezone or "UTC"
        if automation_type == "inactivity":
            last_activity = user.last_active_at or user.created_at
            if last_activity and last_activity > now - timedelta(
                hours=settings.INACTIVITY_THRESHOLD_HOURS
            ):
                schedule.last_evaluated_at = schedule.last_success_at = now
                schedule.failure_count, schedule.locked_at = 0, None
                schedule.next_evaluation_at = last_activity + timedelta(
                    hours=settings.INACTIVITY_THRESHOLD_HOURS
                )
                return "suppressed"
            event_type = "inactivity.eligible"
            logical = last_activity.isoformat() if last_activity else "none"
        elif automation_type == "streak_risk":
            streak = db.get(LearningStreak, user.id)
            local_today = now.astimezone(safe_timezone(timezone_name)).date()
            if (
                not streak
                or streak.current_streak <= 0
                or streak.last_qualifying_local_date != local_today - timedelta(days=1)
                or not in_streak_risk_window(now, timezone_name)
            ):
                advance_schedule(schedule, now=now, timezone_name=timezone_name)
                return "suppressed"
            event_type, logical = "streak.at_risk", local_today.isoformat()
        else:
            event_type = "weekly_summary.eligible"
            local_date = now.astimezone(safe_timezone(timezone_name)).date()
            logical = (local_date - timedelta(days=local_date.weekday())).isoformat()
        actions = event_actions(event_type, prefs, now)
        idempotency_key = f"{automation_type}-evaluation:{user.id}:{logical}"
        event = db.scalar(
            select(EngagementEvent).where(
                EngagementEvent.idempotency_key == idempotency_key
            )
        )
        if event is None:
            event = EngagementEvent(
                user_id=user.id,
                event_type=event_type,
                source="automation",
                metadata_={
                    "engagement_decisions": [a.value for a in actions],
                    "correlation_id": str(correlation_id),
                },
                idempotency_key=idempotency_key,
                occurred_at=now,
            )
            db.add(event)
            db.flush()
        outcome = "evaluated"
        if automation_type == "weekly_summary" and DecisionAction.email in actions:
            stats = compute_weekly_stats(user.id)
            if stats["cards_reviewed"] or stats["sets_completed"]:
                base = settings.FRONTEND_URL.rstrip("/")
                schedule_job(
                    db,
                    user_id=user.id,
                    event_id=event.id,
                    template_key="weekly_progress_summary",
                    category="weekly_summary",
                    classification="lifecycle",
                    idempotency_key=f"weekly:{user.id}:{logical}",
                    deduplication_key=f"weekly:{user.id}:{logical}",
                    scheduled_for=now,
                    payload={
                        "first_name": user.full_name.split()[0]
                        if user.full_name
                        else "there",
                        "recipient_verified": True,
                        "cta_url": f"{base}/dashboard",
                        "preferences_url": f"{base}/settings",
                        "metrics": {
                            "units_completed": stats["sets_completed"],
                            "learning_minutes": stats["learning_minutes"],
                            "assessments_completed": stats["assessments_completed"],
                            "assessment_average": stats["avg_score"],
                            "current_streak": stats["streak_days"],
                        },
                        "change_from_previous": stats["change_from_previous"],
                        "suggested_next_action": stats["suggested_next_action"],
                    },
                    correlation_id=correlation_id,
                )
                outcome = "scheduled"
            else:
                outcome = "suppressed"
        advance_schedule(schedule, now=now, timezone_name=timezone_name)
        return outcome


def run_candidate_scan(automation_type: str, interval_seconds: int) -> dict:
    now, correlation_id = datetime.now(UTC), uuid.uuid4()
    key = f"{automation_type}:{_bucket(now, interval_seconds)}"
    with sync_session() as db:
        run, created = begin_run(
            db, automation_type, key, correlation_id, socket.gethostname()
        )
        run_id = run.id
    task_event("task_started", automation_type=automation_type, task_name=f"scan_{automation_type}",
               idempotency_key=key, correlation_id=correlation_id, worker_id=socket.gethostname(), outcome="running")
    if not created:
        increment("engagement_worker_claim_conflicts_total", automation_type=automation_type,
                  outcome="duplicate_delivery")
        return {"outcome": "no_due_work", "idempotency_key": key}
    if run.correlation_id != correlation_id:
        task_event("lease_recovered", automation_type=automation_type,
            task_name=f"scan_{automation_type}", idempotency_key=key,
            correlation_id=run.correlation_id, worker_id=socket.gethostname(),
            outcome="recovered")
    if not settings.ENGAGEMENT_AUTOMATION_ENABLED:
        _finish_run(run_id, {}, "cancelled")
        return {"outcome": "no_due_work", "idempotency_key": key}
    counts = {
        "batch": 0,
        "claimed": 0,
        "evaluated": 0,
        "scheduled": 0,
        "suppressed": 0,
        "failed": 0,
    }
    started = monotonic_time.monotonic()
    timed_out = False
    for _ in range(settings.AUTOMATION_MAX_BATCHES_PER_RUN):
        if monotonic_time.monotonic() - started >= settings.AUTOMATION_TASK_SOFT_TIME_LIMIT_SECONDS:
            timed_out = True
            break
        with sync_session() as db:
            batch_started = monotonic_time.monotonic()
            rows = claim_due_schedules(
                db,
                automation_type,
                now=now,
                limit=settings.AUTOMATION_BATCH_SIZE,
                correlation_id=correlation_id,
            )
            ids = [row.id for row in rows]
            candidate_ages = {
                row.id: max(0.0, (now - row.next_evaluation_at).total_seconds())
                for row in rows
            }
        observe("engagement_database_batch_duration_seconds",
                monotonic_time.monotonic() - batch_started,
                automation_type=automation_type, outcome="completed")
        if not ids:
            break
        task_event("batch_started", automation_type=automation_type,
            task_name=f"scan_{automation_type}", idempotency_key=key,
            correlation_id=correlation_id, worker_id=socket.gethostname(),
            batch_number=counts["batch"] + 1, claimed_count=len(ids), outcome="running")
        counts["batch"] += 1
        counts["claimed"] += len(ids)
        for schedule_id in ids:
            try:
                candidate_started = monotonic_time.monotonic()
                outcome = _evaluate_schedule(
                    schedule_id, automation_type, now, correlation_id
                )
                elapsed = monotonic_time.monotonic() - candidate_started
                observe("engagement_phase1_evaluation_duration_seconds", elapsed,
                        automation_type=automation_type, outcome=outcome)
                observe("engagement_candidate_age_seconds", candidate_ages[schedule_id],
                        automation_type=automation_type, outcome=outcome)
                counts["evaluated"] += 1
                if outcome != "evaluated" and outcome in counts:
                    counts[outcome] += 1
            except Exception as exc:
                counts["failed"] += 1
                with sync_session() as db:
                    failed_schedule = db.get(EngagementAutomationSchedule, schedule_id, with_for_update=True)
                    if failed_schedule:
                        failed_schedule.failure_count += 1
                        failed_schedule.last_failure_at = now
                        failed_schedule.locked_at = None
                        failed_schedule.next_evaluation_at = now + timedelta(minutes=5)
                log.warning(
                    "automation_item_failed automation_type=%s failure_code=%s",
                    automation_type,
                    type(exc).__name__,
                )
        task_event("batch_completed", automation_type=automation_type,
            task_name=f"scan_{automation_type}", idempotency_key=key,
            correlation_id=correlation_id, worker_id=socket.gethostname(),
            batch_number=counts["batch"], claimed_count=len(ids),
            evaluated_count=counts["evaluated"], scheduled_count=counts["scheduled"],
            suppressed_count=counts["suppressed"], failed_count=counts["failed"],
            outcome="completed")
    with sync_session() as db:
        remaining = int(db.scalar(select(func.count()).select_from(
            EngagementAutomationSchedule).where(
                EngagementAutomationSchedule.automation_type == automation_type,
                EngagementAutomationSchedule.status == "active",
                EngagementAutomationSchedule.next_evaluation_at <= now,
                EngagementAutomationSchedule.locked_at.is_(None))) or 0)
    counts["remaining_due"] = remaining
    status = "timed_out" if timed_out else (
        "partially_completed" if counts["failed"] or remaining else "completed")
    _finish_run(run_id, counts, status)
    duration = monotonic_time.monotonic() - started
    observe("engagement_automation_task_duration_seconds", duration,
            automation_type=automation_type, outcome=status)
    if timed_out:
        increment("engagement_worker_timeouts_total", automation_type=automation_type,
                  outcome="timed_out")
        task_event("task_timed_out", automation_type=automation_type,
            task_name=f"scan_{automation_type}", idempotency_key=key,
            correlation_id=correlation_id, worker_id=socket.gethostname(),
            outcome="timed_out")
    increment(
        "engagement_candidates_evaluated_total",
        counts["evaluated"],
        automation_type=automation_type,
        outcome="completed",
    )
    increment("engagement_automation_runs_total", automation_type=automation_type,
              outcome="partially_completed" if counts["failed"] else "completed")
    if counts["scheduled"]:
        increment("engagement_actions_scheduled_total", counts["scheduled"], automation_type=automation_type,
                  journey=automation_type, action_type="email", outcome="scheduled")
    if counts["suppressed"]:
        increment("engagement_actions_suppressed_total", counts["suppressed"], automation_type=automation_type,
                  journey=automation_type, action_type="evaluation", outcome="suppressed")
    task_event("task_partially_completed" if counts["failed"] else "task_completed",
        automation_type=automation_type, task_name=f"scan_{automation_type}", idempotency_key=key,
        correlation_id=correlation_id, worker_id=socket.gethostname(), batch_number=counts["batch"],
        claimed_count=counts["claimed"], evaluated_count=counts["evaluated"],
        scheduled_count=counts["scheduled"], suppressed_count=counts["suppressed"],
        failed_count=counts["failed"], outcome="partially_completed" if counts["failed"] else "completed")
    return {
        **counts,
        "outcome": "timed_out" if timed_out else (
            "partially_processed" if counts["failed"] or remaining else "processed"),
        "correlation_id": str(correlation_id),
    }


@celery.task(
    name="tasks.automation_tasks.scan_weekly_summary_candidates", **_task_options()
)
def scan_weekly_summary_candidates():
    return run_candidate_scan(
        "weekly_summary", settings.WEEKLY_SUMMARY_SCAN_INTERVAL_MINUTES * 60
    )


@celery.task(
    name="tasks.automation_tasks.scan_inactivity_candidates", **_task_options()
)
def scan_inactivity_candidates():
    return run_candidate_scan(
        "inactivity", settings.INACTIVITY_SCAN_INTERVAL_MINUTES * 60
    )


@celery.task(
    name="tasks.automation_tasks.scan_streak_risk_candidates", **_task_options()
)
def scan_streak_risk_candidates():
    return run_candidate_scan(
        "streak_risk", settings.STREAK_RISK_SCAN_INTERVAL_MINUTES * 60
    )


@celery.task(
    name="tasks.automation_tasks.cleanup_engagement_automation", **_task_options()
)
def cleanup_engagement_automation():
    now, correlation_id = datetime.now(UTC), uuid.uuid4()
    key = f"cleanup:{_bucket(now, settings.ENGAGEMENT_CLEANUP_INTERVAL_HOURS * 3600)}"
    with sync_session() as db:
        run, created = begin_run(db, "cleanup", key, correlation_id, socket.gethostname())
        run_id = run.id
    if not created:
        return {"outcome": "no_due_work", "idempotency_key": key}
    if not settings.ENGAGEMENT_AUTOMATION_ENABLED:
        _finish_run(run_id, {}, "cancelled")
        return {"outcome": "no_due_work", "idempotency_key": key}
    started = monotonic_time.monotonic()
    totals: dict[str, int] = {}
    batches = 0
    for _ in range(1 if settings.ENGAGEMENT_CLEANUP_DRY_RUN else settings.AUTOMATION_MAX_BATCHES_PER_RUN):
        with sync_session() as db:
            counts = cleanup_expired(db, now=now, limit=settings.AUTOMATION_BATCH_SIZE,
                                     dry_run=settings.ENGAGEMENT_CLEANUP_DRY_RUN)
        processed = sum(counts.values())
        for name, count in counts.items():
            totals[name] = totals.get(name, 0) + count
        if not processed:
            break
        batches += 1
    with sync_session() as db:
        remaining = cleanup_remaining_count(db, now=now)
    increment(
        "engagement_cleanup_records_total",
        0 if settings.ENGAGEMENT_CLEANUP_DRY_RUN else sum(totals.values()),
        automation_type="cleanup",
        cleanup_type="retention",
        outcome="dry_run" if settings.ENGAGEMENT_CLEANUP_DRY_RUN else "deleted",
    )
    total = sum(totals.values())
    run_status = "partially_completed" if remaining and not settings.ENGAGEMENT_CLEANUP_DRY_RUN else "completed"
    _finish_run(run_id, {"batch": batches, "evaluated": total,
                         "remaining_due": remaining}, run_status)
    duration = monotonic_time.monotonic() - started
    observe("engagement_cleanup_duration_seconds", duration, automation_type="cleanup",
            outcome="dry_run" if settings.ENGAGEMENT_CLEANUP_DRY_RUN else "deleted")
    task_event("cleanup_completed", automation_type="cleanup", task_name="cleanup_engagement_automation",
        idempotency_key=key, correlation_id=correlation_id, worker_id=socket.gethostname(),
        evaluated_count=total, outcome="dry_run" if settings.ENGAGEMENT_CLEANUP_DRY_RUN else "deleted",
        duration_ms=round(duration * 1000, 2))
    return {
        "outcome": "dry_run" if settings.ENGAGEMENT_CLEANUP_DRY_RUN else "processed",
        **totals,
        "remaining_due": remaining,
    }


@celery.task(
    name="tasks.automation_tasks.backfill_automation_schedules", **_task_options()
)
def backfill_automation_schedules(
    after_user_id: str | None = None, dry_run: bool = True
):
    now, correlation_id = datetime.now(UTC), uuid.uuid4()
    key = f"backfill:{after_user_id or 'start'}:{int(dry_run)}"
    with sync_session() as db:
        run, created = begin_run(db, "backfill", key, correlation_id, socket.gethostname())
        run_id = run.id
    if not created:
        return {"outcome": "no_due_work", "idempotency_key": key}
    with sync_session() as db:
        query = (
            select(User)
            .where(User.is_banned.is_(False))
            .order_by(User.id)
            .limit(settings.AUTOMATION_BATCH_SIZE)
        )
        if after_user_id:
            query = query.where(User.id > after_user_id)
        users = db.scalars(query).all()
        created = sum(
            upsert_user_schedules(db, user, now=now, dry_run=dry_run) for user in users
        )
        next_cursor = str(users[-1].id) if users else None
        remaining = int(db.scalar(select(func.count()).select_from(User).where(
            User.is_banned.is_(False),
            User.id > users[-1].id if users else True)) or 0)
    _finish_run(run_id, {"evaluated": len(users), "scheduled": created,
                         "remaining_due": remaining},
                "partially_completed" if remaining else "completed")
    task_event("backfill_progress", automation_type="backfill", task_name="backfill_automation_schedules",
        idempotency_key=key, correlation_id=correlation_id, worker_id=socket.gethostname(),
        evaluated_count=len(users), scheduled_count=created, outcome="dry_run" if dry_run else "processed")
    return {
        "evaluated": len(users),
        "created": created,
        "next_cursor": next_cursor,
        "dry_run": dry_run,
        "remaining_due": remaining,
    }
