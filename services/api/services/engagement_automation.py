"""Indexed candidate discovery and bounded automation state transitions."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, time, timedelta

from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from config import settings
from models.automation import EngagementAutomationRun, EngagementAutomationSchedule
from models.email import EmailDeliveryLog, EmailJob, EmailProviderEvent
from models.engagement import EngagementPreference, NudgeState
from models.user import User
from services.engagement import safe_timezone

AUTOMATION_TYPES = ("weekly_summary", "inactivity", "streak_risk")

# Explicit Phase 3 retention policy. ``None`` means routine cleanup must never
# delete that record type; predicates below implement the conditional entries.
RETENTION_POLICY = {
    "nudge_states": ("ENGAGEMENT_STATE_RETENTION_DAYS", True, "expired only"),
    "email_jobs": ("EMAIL_JOB_RETENTION_DAYS", True, "terminal and unreferenced"),
    "email_delivery_logs": ("EMAIL_DELIVERY_LOG_RETENTION_DAYS", True, "expired audit history"),
    "provider_events": ("PROVIDER_EVENT_RETENTION_DAYS", True, "after replay window"),
    "automation_runs": ("AUTOMATION_RUN_RETENTION_DAYS", True, "completed only"),
    "automation_schedules": (None, False, "persistent cursor"),
    "pending_processing_retryable_jobs": (None, False, "active work"),
    "email_suppressions": (None, False, "compliance evidence"),
    "email_contacts": (None, False, "consent and unsubscribe evidence"),
}


def next_local_week(now: datetime, timezone_name: str) -> datetime:
    zone = safe_timezone(timezone_name)
    local = now.astimezone(zone)
    days = 7 - local.weekday()
    target = datetime.combine(local.date() + timedelta(days=days), time(9), tzinfo=zone)
    return target.astimezone(UTC)


def next_streak_risk(now: datetime, timezone_name: str) -> datetime:
    zone = safe_timezone(timezone_name)
    local = now.astimezone(zone)
    midnight = datetime.combine(local.date() + timedelta(days=1), time.min, tzinfo=zone)
    target = midnight - timedelta(minutes=settings.STREAK_RISK_WINDOW_MINUTES)
    if target <= local:
        target += timedelta(days=1)
    return target.astimezone(UTC)


def in_streak_risk_window(now: datetime, timezone_name: str) -> bool:
    """Return whether ``now`` is in the user's final local-day risk window."""
    zone = safe_timezone(timezone_name)
    local = now.astimezone(zone)
    midnight = datetime.combine(local.date() + timedelta(days=1), time.min, tzinfo=zone)
    return midnight - timedelta(minutes=settings.STREAK_RISK_WINDOW_MINUTES) <= local < midnight


def upsert_user_schedules(
    db: Session, user: User, *, now: datetime, dry_run: bool = False
) -> int:
    if user.is_banned:
        return 0
    prefs = db.get(EngagementPreference, user.id)
    timezone_name = prefs.timezone if prefs else "UTC"
    activity = user.last_active_at or user.created_at or now
    due = {
        "weekly_summary": next_local_week(now, timezone_name),
        "inactivity": activity + timedelta(hours=settings.INACTIVITY_THRESHOLD_HOURS),
        "streak_risk": next_streak_risk(now, timezone_name),
    }
    if dry_run:
        existing = (
            db.scalar(
                select(func.count())
                .select_from(EngagementAutomationSchedule)
                .where(EngagementAutomationSchedule.user_id == user.id)
            )
            or 0
        )
        return max(0, len(due) - int(existing))
    count = 0
    for automation_type, next_at in due.items():
        inserted = db.scalar(
            insert(EngagementAutomationSchedule)
            .values(
                id=uuid.uuid4(),
                user_id=user.id,
                automation_type=automation_type,
                status="active",
                next_evaluation_at=next_at,
                context={},
            )
            .on_conflict_do_nothing(
                index_elements=[
                    EngagementAutomationSchedule.user_id,
                    EngagementAutomationSchedule.automation_type,
                ]
            )
            .returning(EngagementAutomationSchedule.id)
        )
        count += int(inserted is not None)
    return count


def claim_due_schedules(
    db: Session,
    automation_type: str,
    *,
    now: datetime,
    limit: int,
    correlation_id: uuid.UUID,
) -> list[EngagementAutomationSchedule]:
    stale_before = now - timedelta(
        seconds=settings.AUTOMATION_TASK_TIME_LIMIT_SECONDS * 2
    )
    rows = db.scalars(
        select(EngagementAutomationSchedule)
        .where(
            EngagementAutomationSchedule.automation_type == automation_type,
            EngagementAutomationSchedule.status == "active",
            EngagementAutomationSchedule.next_evaluation_at <= now,
            (EngagementAutomationSchedule.locked_at.is_(None))
            | (EngagementAutomationSchedule.locked_at < stale_before),
        )
        .order_by(
            EngagementAutomationSchedule.next_evaluation_at,
            EngagementAutomationSchedule.id,
        )
        .limit(limit)
        .with_for_update(skip_locked=True)
    ).all()
    for row in rows:
        row.locked_at, row.correlation_id = now, correlation_id
    db.flush()
    return rows


def advance_schedule(
    schedule: EngagementAutomationSchedule, *, now: datetime, timezone_name: str
) -> None:
    schedule.last_evaluated_at = schedule.last_success_at = now
    schedule.failure_count, schedule.locked_at = 0, None
    if schedule.automation_type == "weekly_summary":
        schedule.next_evaluation_at = next_local_week(now, timezone_name)
    elif schedule.automation_type == "inactivity":
        schedule.next_evaluation_at = now + timedelta(
            hours=settings.INACTIVITY_RECHECK_COOLDOWN_HOURS
        )
    else:
        schedule.next_evaluation_at = next_streak_risk(now, timezone_name)


def begin_run(
    db: Session,
    automation_type: str,
    idempotency_key: str,
    correlation_id: uuid.UUID,
    worker_id: str | None,
) -> tuple[EngagementAutomationRun, bool]:
    inserted = db.scalar(
        insert(EngagementAutomationRun)
        .values(
            id=uuid.uuid4(),
            automation_type=automation_type,
            idempotency_key=idempotency_key,
            correlation_id=correlation_id,
            status="running",
            started_at=datetime.now(UTC),
            worker_id=worker_id,
        )
        .on_conflict_do_nothing(
            index_elements=[EngagementAutomationRun.idempotency_key]
        )
        .returning(EngagementAutomationRun.id)
    )
    if inserted:
        return db.get(EngagementAutomationRun, inserted), True

    row = db.scalar(
        select(EngagementAutomationRun)
        .where(EngagementAutomationRun.idempotency_key == idempotency_key)
        .with_for_update()
    )
    stale_before = datetime.now(UTC) - timedelta(
        seconds=settings.AUTOMATION_TASK_TIME_LIMIT_SECONDS * 2
    )
    if row.status == "running" and row.started_at < stale_before:
        # Resume the same logical run instead of creating a second run.  Keeping
        # its correlation id makes retries traceable as one operation.
        row.started_at = datetime.now(UTC)
        row.worker_id = worker_id
        row.last_error_code = row.last_error_message = None
        return row, True
    return row, False


def cleanup_expired(
    db: Session, *, now: datetime, limit: int, dry_run: bool
) -> dict[str, int]:
    predicates = {
        "nudge_states": (
            NudgeState,
            NudgeState.expires_at
            < now - timedelta(days=settings.ENGAGEMENT_STATE_RETENTION_DAYS),
        ),
        "email_jobs": (
            EmailJob,
            EmailJob.status.in_(("sent", "cancelled", "suppressed", "dead_letter"))
            & (
                EmailJob.updated_at
                < now - timedelta(days=settings.EMAIL_JOB_RETENTION_DAYS)
            ),
        ),
        "email_delivery_logs": (
            EmailDeliveryLog,
            EmailDeliveryLog.created_at
            < now - timedelta(days=settings.EMAIL_DELIVERY_LOG_RETENTION_DAYS),
        ),
        "provider_events": (
            EmailProviderEvent,
            EmailProviderEvent.created_at
            < now - timedelta(days=settings.PROVIDER_EVENT_RETENTION_DAYS),
        ),
        "automation_runs": (
            EngagementAutomationRun,
            EngagementAutomationRun.completed_at
            < now - timedelta(days=settings.AUTOMATION_RUN_RETENTION_DAYS),
        ),
    }
    counts = {}
    remaining_limit = limit
    for key, (model, predicate) in predicates.items():
        if remaining_limit <= 0:
            counts[key] = 0
            continue
        query = select(model.id if hasattr(model, "id") else model.provider_event_id).where(predicate)
        if model is EmailJob:
            query = query.where(
                ~select(EmailDeliveryLog.id)
                .where(EmailDeliveryLog.email_job_id == EmailJob.id)
                .exists()
            )
        ids = db.scalars(
            query.limit(remaining_limit).with_for_update(skip_locked=True)
        ).all()
        counts[key] = len(ids)
        remaining_limit -= len(ids)
        if ids and not dry_run:
            column = model.id if hasattr(model, "id") else model.provider_event_id
            db.execute(delete(model).where(column.in_(ids)))
    return counts


def cleanup_remaining_count(db: Session, *, now: datetime) -> int:
    """Count all currently eligible cleanup rows without locking or mutation."""
    cutoffs = (
        select(func.count()).select_from(NudgeState).where(
            NudgeState.expires_at < now - timedelta(days=settings.ENGAGEMENT_STATE_RETENTION_DAYS)
        ),
        select(func.count()).select_from(EmailJob).where(
            EmailJob.status.in_(("sent", "cancelled", "suppressed", "dead_letter")),
            EmailJob.updated_at < now - timedelta(days=settings.EMAIL_JOB_RETENTION_DAYS),
            ~select(EmailDeliveryLog.id).where(
                EmailDeliveryLog.email_job_id == EmailJob.id).exists(),
        ),
        select(func.count()).select_from(EmailDeliveryLog).where(
            EmailDeliveryLog.created_at < now - timedelta(days=settings.EMAIL_DELIVERY_LOG_RETENTION_DAYS)
        ),
        select(func.count()).select_from(EmailProviderEvent).where(
            EmailProviderEvent.created_at < now - timedelta(days=settings.PROVIDER_EVENT_RETENTION_DAYS)
        ),
        select(func.count()).select_from(EngagementAutomationRun).where(
            EngagementAutomationRun.completed_at < now - timedelta(days=settings.AUTOMATION_RUN_RETENTION_DAYS)
        ),
    )
    return sum(int(db.scalar(query) or 0) for query in cutoffs)
