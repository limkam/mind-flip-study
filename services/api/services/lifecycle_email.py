"""Scheduling, suppression, cancellation, claiming, and retry state transitions."""

from __future__ import annotations

import random
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, time, timedelta
from enum import StrEnum

from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from config import settings
from models.email import EmailContact, EmailDeliveryLog, EmailJob, EmailSuppression
from models.engagement import EngagementEvent, EngagementPreference
from models.user import User
from services.engagement import safe_timezone
from services.email_coordination import coordination_lock_key


class SuppressionAction(StrEnum):
    allow = "allow"
    suppress = "suppress"
    cancel = "cancel"
    reschedule = "reschedule"


@dataclass(frozen=True)
class SuppressionDecision:
    action: SuppressionAction
    reason: str
    reschedule_at: datetime | None = None


def acquire_coordination_lock(
    db: Session, user_id: uuid.UUID, entity_type: str | None, entity_id: str | None
) -> None:
    if entity_type and entity_id:
        db.execute(
            text("SELECT pg_advisory_xact_lock(:key)"),
            {"key": coordination_lock_key(user_id, entity_type, entity_id)},
        )


def _log(
    db: Session,
    job: EmailJob,
    event: str,
    old: str | None,
    new: str | None,
    **values: object,
) -> None:
    db.add(
        EmailDeliveryLog(
            email_job_id=job.id,
            user_id=job.user_id,
            attempt_number=job.retry_count + 1,
            event_type=event,
            previous_status=old,
            new_status=new,
            correlation_id=job.correlation_id,
            provider=values.get("provider"),
            provider_message_id=values.get("provider_message_id"),
            retryable=values.get("retryable"),
            failure_category=values.get("failure_category"),
            failure_reason=values.get("failure_reason"),
            provider_metadata=values.get("provider_metadata") or {},
        )
    )


def schedule_job(
    db: Session,
    *,
    user_id: uuid.UUID,
    template_key: str,
    category: str,
    classification: str,
    idempotency_key: str,
    deduplication_key: str,
    scheduled_for: datetime,
    payload: dict,
    event_id: uuid.UUID | None = None,
    entity_type: str | None = None,
    entity_id: str | None = None,
    priority: int = 0,
    expires_at: datetime | None = None,
    correlation_id: uuid.UUID | None = None,
) -> EmailJob:
    existing = db.scalar(
        select(EmailJob).where(EmailJob.deduplication_key == deduplication_key)
    )
    if existing:
        return existing
    contact = db.get(EmailContact, user_id)
    if contact is None:
        db.execute(
            insert(EmailContact)
            .values(user_id=user_id, public_id=uuid.uuid4())
            .on_conflict_do_nothing(index_elements=[EmailContact.user_id])
        )
        contact = db.get(EmailContact, user_id)
        if contact is None:
            raise RuntimeError("email contact could not be created")
    safe_payload = dict(payload)
    if (
        classification == "lifecycle"
        and settings.EMAIL_UNSUBSCRIBE_SECRET
        and not safe_payload.get("unsubscribe_url")
    ):
        from emails.unsubscribe import make_token

        token = make_token(contact.public_id, category)
        safe_payload["unsubscribe_url"] = (
            f"{settings.EMAIL_PUBLIC_BASE_URL.rstrip('/')}/email/unsubscribe/{token}"
        )
    job = EmailJob(
        user_id=user_id,
        engagement_event_id=event_id,
        template_key=template_key,
        template_version="v1",
        category=category,
        classification=classification,
        priority=priority,
        scheduled_for=scheduled_for,
        next_attempt_at=scheduled_for,
        max_retries=settings.EMAIL_JOB_MAX_RETRIES,
        idempotency_key=idempotency_key,
        deduplication_key=deduplication_key,
        entity_type=entity_type,
        entity_id=entity_id,
        payload=safe_payload,
        expires_at=expires_at,
        correlation_id=correlation_id or uuid.uuid4(),
    )
    db.add(job)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        found = db.scalar(
            select(EmailJob).where(EmailJob.deduplication_key == deduplication_key)
        )
        if found:
            return found
        raise
    _log(db, job, "scheduled", None, "pending")
    return job


def _quiet_end(now: datetime, prefs: EngagementPreference) -> datetime | None:
    if (
        not prefs.quiet_hours_start
        or not prefs.quiet_hours_end
        or prefs.quiet_hours_start == prefs.quiet_hours_end
    ):
        return None
    zone = safe_timezone(prefs.timezone)
    local = now.astimezone(zone)
    start = time.fromisoformat(prefs.quiet_hours_start)
    end = time.fromisoformat(prefs.quiet_hours_end)
    clock = local.time().replace(tzinfo=None)
    quiet = start <= clock < end if start < end else clock >= start or clock < end
    if not quiet:
        return None
    end_date = (
        local.date() + timedelta(days=1)
        if (start >= end and clock >= start)
        else local.date()
    )
    return datetime.combine(end_date, end, tzinfo=zone).astimezone(UTC)


def should_send_email(
    *, db: Session, user: User, job: EmailJob, now: datetime
) -> SuppressionDecision:
    if job.status not in {"processing", "pending"}:
        return SuppressionDecision(
            SuppressionAction.cancel, "terminal_or_invalid_status"
        )
    if job.expires_at and job.expires_at <= now:
        return SuppressionDecision(SuppressionAction.cancel, "expired_relevance")
    if not user.email:
        return SuppressionDecision(SuppressionAction.suppress, "recipient_missing")
    if not bool(job.payload.get("recipient_verified", False)):
        return SuppressionDecision(SuppressionAction.suppress, "recipient_unverified")
    flags = {
        "welcome": settings.EMAIL_WELCOME_ENABLED,
        "continue_learning": settings.EMAIL_CONTINUE_LEARNING_ENABLED,
        "achievement_unlocked": settings.EMAIL_ACHIEVEMENT_ENABLED,
        "weekly_progress_summary": settings.EMAIL_WEEKLY_SUMMARY_ENABLED,
    }
    if (
        not settings.EMAIL_GLOBAL_ENABLED
        or not settings.ENGAGEMENT_LIFECYCLE_EMAILS_ENABLED
    ):
        return SuppressionDecision(
            SuppressionAction.suppress, "global_feature_disabled"
        )
    if not flags.get(job.template_key, False):
        return SuppressionDecision(
            SuppressionAction.suppress, "journey_feature_disabled"
        )
    if user.is_banned:
        return SuppressionDecision(SuppressionAction.suppress, "account_suspended")
    prefs = db.get(EngagementPreference, user.id)
    if prefs:
        allowed = {
            "learning": prefs.learning_reminders,
            "achievements": prefs.achievement_announcements,
            "weekly_summary": prefs.weekly_summaries,
            "welcome": True,
        }.get(job.category, False)
        if not allowed:
            return SuppressionDecision(SuppressionAction.suppress, "category_disabled")
        quiet_end = _quiet_end(now, prefs)
        if quiet_end:
            if job.expires_at and quiet_end >= job.expires_at:
                return SuppressionDecision(
                    SuppressionAction.cancel, "expires_during_quiet_hours"
                )
            return SuppressionDecision(
                SuppressionAction.reschedule, "quiet_hours", quiet_end
            )
    contact = db.get(EmailContact, user.id)
    if job.classification == "lifecycle" and (
        contact is None or contact.lifecycle_consent_at is None
    ):
        return SuppressionDecision(SuppressionAction.suppress, "missing_consent")
    scopes = (
        ("global", job.category)
        if job.classification == "lifecycle"
        else (job.category,)
    )
    suppressed = db.scalar(
        select(EmailSuppression.id).where(
            EmailSuppression.user_id == user.id, EmailSuppression.scope.in_(scopes)
        )
    )
    if suppressed:
        return SuppressionDecision(
            SuppressionAction.suppress, "bounce_complaint_or_unsubscribe"
        )
    if job.entity_type and job.entity_id:
        done = db.scalar(
            select(EngagementEvent.id)
            .where(
                EngagementEvent.user_id == user.id,
                EngagementEvent.entity_type == job.entity_type,
                EngagementEvent.entity_id == job.entity_id,
                EngagementEvent.event_type.in_(
                    (f"{job.entity_type}.completed", "assessment.completed")
                ),
            )
            .limit(1)
        )
        if done:
            return SuppressionDecision(SuppressionAction.cancel, "action_completed")
    mode = settings.EMAIL_DELIVERY_MODE.lower()
    if mode == "disabled":
        return SuppressionDecision(SuppressionAction.suppress, "delivery_disabled")
    if mode == "test" and user.email.lower() not in settings.email_test_recipients:
        return SuppressionDecision(
            SuppressionAction.suppress, "test_recipient_not_allowed"
        )
    if mode == "production" and not (
        settings.EMAIL_PRODUCTION_ENABLED
        and settings.EMAIL_SENDING_DOMAIN_VERIFIED
        and settings.RESEND_API_KEY
    ):
        return SuppressionDecision(
            SuppressionAction.suppress, "production_configuration_invalid"
        )
    return SuppressionDecision(SuppressionAction.allow, "eligible")


def cancel_pending_jobs(
    db: Session,
    *,
    user_id: uuid.UUID,
    template_key: str,
    entity_type: str,
    entity_id: str,
) -> int:
    acquire_coordination_lock(db, user_id, entity_type, entity_id)
    jobs = db.scalars(
        select(EmailJob)
        .where(
            EmailJob.user_id == user_id,
            EmailJob.template_key == template_key,
            EmailJob.entity_type == entity_type,
            EmailJob.entity_id == entity_id,
            EmailJob.status.in_(("pending", "processing")),
            EmailJob.send_authorized_at.is_(None),
        )
        .with_for_update()
    ).all()
    now = datetime.now(UTC)
    for job in jobs:
        old, job.status, job.cancelled_at = job.status, "cancelled", now
        _log(
            db,
            job,
            "cancelled",
            old,
            "cancelled",
            failure_category="cancelled",
            failure_reason="action_completed",
        )
    return len(jobs)


def claim_due_jobs(db: Session, *, now: datetime, limit: int) -> list[EmailJob]:
    jobs = db.scalars(
        select(EmailJob)
        .where(EmailJob.status == "pending", EmailJob.next_attempt_at <= now)
        .order_by(EmailJob.priority.desc(), EmailJob.next_attempt_at)
        .limit(limit)
        .with_for_update(skip_locked=True)
    ).all()
    for job in jobs:
        job.status, job.processing_started_at = "processing", now
        _log(db, job, "processing_started", "pending", "processing")
    db.flush()
    return jobs


def retry_at(
    job: EmailJob,
    now: datetime,
    *,
    random_source: random.Random | random.SystemRandom | None = None,
    retry_after_seconds: int | None = None,
) -> datetime:
    """Return retry time; retry_count is the number of failures already persisted."""
    base = settings.EMAIL_RETRY_BASE_SECONDS * (2 ** max(0, job.retry_count - 1))
    bounded = min(
        settings.EMAIL_RETRY_MAX_SECONDS, max(settings.EMAIL_RETRY_BASE_SECONDS, base)
    )
    if retry_after_seconds is not None:
        bounded = min(
            settings.EMAIL_RETRY_MAX_SECONDS, max(bounded, retry_after_seconds)
        )
    rng = random_source or random.SystemRandom()
    jitter = rng.uniform(0, bounded * settings.EMAIL_RETRY_JITTER_RATIO)
    return now + timedelta(
        seconds=min(settings.EMAIL_RETRY_MAX_SECONDS, bounded + jitter)
    )
