"""Celery tasks for transactional email (Resend)."""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select, update

from config import settings
from database_sync import sync_session
from emails.sender import send_email
from emails.stats import compute_weekly_stats, email_notifications_enabled
from emails.templates.challenge import challenge_alert_email
from emails.templates.password_reset import password_reset_email
from emails.templates.sign_in_code import sign_in_code_email
from emails.templates.streak import streak_reminder_email
from emails.templates.weekly_digest import weekly_digest_email
from models.quiz import StudyEvent
from models.user import User
from models.user_subscription import UserSubscription
from models.email import EmailJob
from models.engagement import EngagementPreference
from services.engagement import safe_timezone
from services.lifecycle_email import (
    _log,
    acquire_coordination_lock,
    cancel_pending_jobs,
    claim_due_jobs,
    retry_at,
    schedule_job,
    should_send_email,
    SuppressionAction,
)
from emails.provider import provider_for
from emails.templates.lifecycle import render_lifecycle
from tasks.celery_app import celery

log = logging.getLogger(__name__)


def local_week_key(now: datetime, timezone_name: str) -> str:
    local_date = now.astimezone(safe_timezone(timezone_name)).date()
    monday = local_date - timedelta(days=local_date.weekday())
    return monday.isoformat()


@celery.task(name="tasks.email_tasks.send_sign_in_code_task")
def send_sign_in_code_task(email: str, code: str) -> bool:
    return send_email(
        to=email,
        subject="Your MindFlip Verification Code",
        html=sign_in_code_email(code),
    )


@celery.task(name="tasks.email_tasks.schedule_welcome_email_task")
def schedule_welcome_email_task(user_id: str) -> bool:
    now = datetime.now(UTC)
    with sync_session() as db:
        user = db.get(User, user_id)
        if not user:
            return False
        base = settings.FRONTEND_URL.rstrip("/")
        schedule_job(
            db,
            user_id=user.id,
            template_key="welcome",
            category="welcome",
            classification="transactional_lifecycle",
            idempotency_key=f"welcome:{user.id}",
            deduplication_key=f"welcome:{user.id}",
            scheduled_for=now,
            priority=100,
            payload={
                "first_name": user.full_name.split()[0] if user.full_name else "there",
                "recipient_verified": True,
                "cta_url": f"{base}/library",
                "preferences_url": f"{base}/settings",
            },
        )
    return True


@celery.task(name="tasks.email_tasks.send_streak_reminder_task")
def send_streak_reminder_task(full_name: str, email: str, streak_days: int) -> bool:
    subject = (
        f"Don't break your {streak_days}-day streak 🔥"
        if streak_days > 1
        else "Study something today 📚"
    )
    html = streak_reminder_email(full_name, streak_days)
    return send_email(to=email, subject=subject, html=html)


@celery.task(name="tasks.email_tasks.send_challenge_alert_task")
def send_challenge_alert_task(
    recipient_name: str,
    recipient_email: str,
    challenger_name: str,
    set_title: str,
    challenger_score: int,
    challenge_id: str,
) -> bool:
    html = challenge_alert_email(
        recipient_name,
        challenger_name,
        set_title,
        challenger_score,
        challenge_id,
    )
    return send_email(
        to=recipient_email,
        subject=f"{challenger_name} challenged you on MindFlip ⚔️",
        html=html,
    )


@celery.task(name="tasks.email_tasks.send_password_reset_task")
def send_password_reset_task(full_name: str, email: str, reset_token: str) -> bool:
    html = password_reset_email(full_name, reset_token)
    return send_email(to=email, subject="Reset your MindFlip password", html=html)


@celery.task(name="tasks.email_tasks.send_weekly_digests_task")
def send_weekly_digests_task() -> dict[str, int]:
    """Monday 9am UTC — enqueue digest for active users with email prefs enabled."""
    since_30 = datetime.now(UTC) - timedelta(days=30)
    queued = 0
    skipped = 0

    with sync_session() as db:
        users = (
            db.execute(
                select(User).where(User.is_banned.is_(False)),
            )
            .scalars()
            .all()
        )

        for user in users:
            if not email_notifications_enabled(user, weekly_digest=True):
                skipped += 1
                continue
            active = db.scalar(
                select(func.count(StudyEvent.id)).where(
                    StudyEvent.user_id == user.id,
                    StudyEvent.created_at >= since_30,
                ),
            )
            if not active:
                skipped += 1
                continue
            stats = compute_weekly_stats(user.id)
            if stats["cards_reviewed"] == 0 and stats["sets_completed"] == 0:
                skipped += 1
                continue
            prefs = db.get(EngagementPreference, user.id)
            period_start = local_week_key(
                datetime.now(UTC), prefs.timezone if prefs else "UTC"
            )
            base = settings.FRONTEND_URL.rstrip("/")
            schedule_job(
                db,
                user_id=user.id,
                template_key="weekly_progress_summary",
                category="weekly_summary",
                classification="lifecycle",
                idempotency_key=f"weekly:{user.id}:{period_start}",
                deduplication_key=f"weekly:{user.id}:{period_start}",
                scheduled_for=datetime.now(UTC),
                payload={
                    "first_name": user.full_name.split()[0]
                    if user.full_name
                    else "there",
                    "recipient_verified": True,
                    "cta_url": f"{base}/dashboard",
                    "preferences_url": f"{base}/settings",
                    "metrics": {
                        "units_completed": stats["sets_completed"],
                        "learning_minutes": 0,
                        "assessments_completed": stats["cards_reviewed"],
                        "assessment_average": stats["avg_score"],
                        "current_streak": stats["streak_days"],
                    },
                },
            )
            queued += 1

    log.info("weekly digests queued=%s skipped=%s", queued, skipped)
    return {"queued": queued, "skipped": skipped}


@celery.task(name="tasks.email_tasks.send_weekly_digest_email_task")
def send_weekly_digest_email_task(full_name: str, email: str, stats: dict) -> bool:
    html = weekly_digest_email(full_name, stats)
    return send_email(to=email, subject="Your MindFlip week in review 📊", html=html)


@celery.task(name="tasks.email_tasks.send_challenge_alert_task")
def send_challenge_alert_task(
    recipient_name: str,
    recipient_email: str,
    challenger_name: str,
    set_title: str,
    challenger_score: int,
    challenge_id: str,
) -> bool:
    from emails.templates.challenge import challenge_alert_email

    html = challenge_alert_email(
        recipient_name, challenger_name, set_title, challenger_score, challenge_id
    )
    return send_email(
        to=recipient_email,
        subject=f"{challenger_name} challenged you on MindFlip ⚔️",
        html=html,
    )


@celery.task(name="tasks.email_tasks.send_second_purchase_upsell_task")
def send_second_purchase_upsell_task(user_id: str, full_name: str, email: str) -> bool:
    """Send upsell email on second credit purchase to encourage subscription upgrade."""
    from emails.templates.upsell import second_purchase_upsell_email

    html = second_purchase_upsell_email(full_name)
    return send_email(
        to=email, subject="Get unlimited credits with MindFlip Pro 🚀", html=html
    )


@celery.task(name="tasks.email_tasks.send_trial_ending_reminders_task")
def send_trial_ending_reminders_task() -> dict[str, int]:
    """Send T-2 day reminder for trialing subscriptions."""
    from emails.templates.trial import trial_ending_soon_email

    now = datetime.now(UTC)
    start = now + timedelta(hours=47)
    end = now + timedelta(hours=49)

    queued = 0
    skipped = 0
    with sync_session() as db:
        rows = db.execute(
            select(UserSubscription, User)
            .join(User, User.id == UserSubscription.user_id)
            .where(
                UserSubscription.status == "trialing",
                UserSubscription.current_period_end.is_not(None),
                UserSubscription.current_period_end >= start,
                UserSubscription.current_period_end < end,
            )
        ).all()

        for sub, user in rows:
            prefs = dict(user.preferences or {})
            trial_meta = dict(prefs.get("trial") or {})
            if trial_meta.get("reminder_sent_at"):
                skipped += 1
                continue
            if not email_notifications_enabled(user, weekly_digest=True):
                skipped += 1
                continue

            html = trial_ending_soon_email(user.full_name, days_left=2)
            ok = send_email(
                to=user.email,
                subject="Your Premium trial ends in 2 days",
                html=html,
            )
            if ok:
                trial_meta["reminder_sent_at"] = now.isoformat()
                prefs["trial"] = trial_meta
                user.preferences = prefs
                db.add(user)
                queued += 1
            else:
                skipped += 1

        db.commit()

    return {"queued": queued, "skipped": skipped}


@celery.task(name="tasks.email_tasks.schedule_engagement_email_task")
def schedule_engagement_email_task(event_id: str) -> bool:
    now = datetime.now(UTC)
    with sync_session() as db:
        from models.engagement import EngagementEvent

        event = db.get(EngagementEvent, event_id)
        if not event or "email" not in (event.metadata_ or {}).get(
            "engagement_decisions", []
        ):
            return False
        user = db.get(User, event.user_id)
        if not user:
            return False
        base = settings.FRONTEND_URL.rstrip("/")
        if event.event_type == "achievement.unlocked":
            schedule_job(
                db,
                user_id=user.id,
                event_id=event.id,
                template_key="achievement_unlocked",
                category="achievements",
                classification="lifecycle",
                idempotency_key=f"achievement-email:{event.id}",
                deduplication_key=f"achievement-email:{user.id}:{event.entity_id}",
                scheduled_for=now,
                priority=80,
                entity_type=event.entity_type,
                entity_id=event.entity_id,
                payload={
                    "first_name": user.full_name.split()[0]
                    if user.full_name
                    else "there",
                    "recipient_verified": True,
                    "achievement_name": (event.metadata_ or {}).get("title")
                    or (event.metadata_ or {}).get("achievement_type")
                    or "Achievement",
                    "cta_url": f"{base}/achievements",
                    "preferences_url": f"{base}/settings",
                },
            )
        else:
            scheduled = now + timedelta(hours=settings.EMAIL_CONTINUE_DELAY_HOURS)
            schedule_job(
                db,
                user_id=user.id,
                event_id=event.id,
                template_key="continue_learning",
                category="learning",
                classification="lifecycle",
                idempotency_key=f"continue:{event.id}",
                deduplication_key=f"continue:{event.user_id}:{event.entity_type}:{event.entity_id}",
                scheduled_for=scheduled,
                expires_at=scheduled + timedelta(days=6),
                entity_type=event.entity_type,
                entity_id=event.entity_id,
                payload={
                    "first_name": user.full_name.split()[0]
                    if user.full_name
                    else "there",
                    "recipient_verified": True,
                    "entity_name": (event.metadata_ or {}).get("title")
                    or "your study session",
                    "cta_url": f"{base}/study/{event.entity_id}",
                    "preferences_url": f"{base}/settings",
                },
            )
    return True


@celery.task(name="tasks.email_tasks.schedule_achievement_email_task")
def schedule_achievement_email_task(
    authority_event_id: str, achievement_id: str
) -> bool:
    from models.achievement import Achievement
    from models.engagement import EngagementEvent

    with sync_session() as db:
        authority = db.get(EngagementEvent, authority_event_id)
        authorized = (
            (authority.metadata_ or {}).get("authorized_achievement_email_ids", [])
            if authority
            else []
        )
        if achievement_id not in authorized:
            return False
        achievement = db.get(Achievement, achievement_id)
        user = db.get(User, authority.user_id) if achievement and authority else None
        if not achievement or not user or achievement.user_id != user.id:
            return False
        base = settings.FRONTEND_URL.rstrip("/")
        meta = achievement.metadata_ or {}
        now = datetime.now(UTC)
        schedule_job(
            db,
            user_id=user.id,
            event_id=authority.id,
            template_key="achievement_unlocked",
            category="achievements",
            classification="lifecycle",
            idempotency_key=f"achievement-email:{achievement.id}",
            deduplication_key=f"achievement-email:{user.id}:{achievement.id}",
            scheduled_for=now,
            priority=80,
            entity_type="achievement",
            entity_id=str(achievement.id),
            payload={
                "first_name": user.full_name.split()[0] if user.full_name else "there",
                "recipient_verified": True,
                "achievement_name": meta.get("title") or achievement.achievement_type,
                "cta_url": f"{base}/achievements",
                "preferences_url": f"{base}/settings",
            },
        )
    return True


@celery.task(name="tasks.email_tasks.cancel_completed_lifecycle_jobs")
def cancel_completed_lifecycle_jobs(
    user_id: str, entity_type: str, entity_id: str
) -> int:
    with sync_session() as db:
        return cancel_pending_jobs(
            db,
            user_id=user_id,
            template_key="continue_learning",
            entity_type=entity_type,
            entity_id=entity_id,
        )


@celery.task(name="tasks.email_tasks.process_lifecycle_email_jobs")
def process_lifecycle_email_jobs() -> dict[str, int]:
    return process_lifecycle_email_jobs_with_provider()


def process_lifecycle_email_jobs_with_provider(
    provider_factory=None, *, now: datetime | None = None
) -> dict:
    now = now or datetime.now(UTC)
    counts = {
        "claimed": 0,
        "sent": 0,
        "suppressed": 0,
        "cancelled": 0,
        "rescheduled": 0,
        "retried": 0,
        "dead_letter": 0,
    }
    attempt_outcomes: list[dict[str, str]] = []
    with sync_session() as db:
        timeout = now - timedelta(minutes=settings.EMAIL_PROCESSING_TIMEOUT_MINUTES)
        db.execute(
            update(EmailJob)
            .where(
                EmailJob.status == "processing",
                EmailJob.processing_started_at < timeout,
                EmailJob.provider_message_id.is_(None),
            )
            .values(
                status="pending",
                next_attempt_at=now,
                processing_started_at=None,
                send_authorized_at=None,
            )
        )
        jobs = claim_due_jobs(
            db, now=now, limit=max(1, min(settings.EMAIL_JOB_BATCH_SIZE, 500))
        )
        job_ids = [job.id for job in jobs]
        queue_delays = [
            max(0.0, (now - job.next_attempt_at).total_seconds()) for job in jobs
        ]
    counts["claimed"] = len(job_ids)
    counts["queue_delays"] = queue_delays
    for job_id in job_ids:
        send_data = None
        with sync_session() as db:
            job = db.get(EmailJob, job_id, with_for_update=True)
            if not job or job.status != "processing":
                continue
            attempt_type = "retry" if job.retry_count > 0 else "first"
            acquire_coordination_lock(db, job.user_id, job.entity_type, job.entity_id)
            user = db.get(User, job.user_id)
            decision = (
                should_send_email(db=db, user=user, job=job, now=now) if user else None
            )
            if not decision or decision.action in {
                SuppressionAction.suppress,
                SuppressionAction.cancel,
            }:
                old = job.status
                job.status = (
                    "cancelled"
                    if decision and decision.action == SuppressionAction.cancel
                    else "suppressed"
                )
                if job.status == "cancelled":
                    job.cancelled_at = now
                else:
                    job.suppressed_at = now
                reason = decision.reason if decision else "user_missing"
                _log(
                    db,
                    job,
                    job.status,
                    old,
                    job.status,
                    failure_category=job.status,
                    failure_reason=reason,
                )
                counts[job.status] += 1
                attempt_outcomes.append({"journey": job.template_key, "attempt_type": attempt_type,
                    "outcome": job.status, "failure_category": reason})
                continue
            if decision.action == SuppressionAction.reschedule:
                job.status, job.next_attempt_at, job.processing_started_at = (
                    "pending",
                    decision.reschedule_at,
                    None,
                )
                _log(
                    db,
                    job,
                    "rescheduled",
                    "processing",
                    "pending",
                    failure_reason=decision.reason,
                )
                counts["rescheduled"] += 1
                attempt_outcomes.append({"journey": job.template_key, "attempt_type": attempt_type,
                    "outcome": "rescheduled", "failure_category": decision.reason})
                continue
            try:
                subject, html, text = render_lifecycle(job.template_key, job.payload)
            except ValueError as exc:
                job.status, job.suppressed_at = "suppressed", now
                _log(
                    db,
                    job,
                    "suppressed",
                    "processing",
                    "suppressed",
                    failure_category="suppressed",
                    failure_reason=str(exc),
                )
                counts["suppressed"] += 1
                attempt_outcomes.append({"journey": job.template_key, "attempt_type": attempt_type,
                    "outcome": "suppressed", "failure_category": "template_error"})
                continue
            provider = (
                provider_factory(user.email)
                if provider_factory
                else provider_for(user.email)
            )
            if provider is None:
                job.status, job.suppressed_at = "suppressed", now
                _log(
                    db,
                    job,
                    "suppressed",
                    "processing",
                    "suppressed",
                    failure_category="configuration_error",
                    failure_reason="provider safety gate",
                )
                counts["suppressed"] += 1
                attempt_outcomes.append({"journey": job.template_key, "attempt_type": attempt_type,
                    "outcome": "suppressed", "failure_category": "configuration_error"})
                continue
            job.send_authorized_at = now
            send_data = (
                user.email,
                subject,
                html,
                text,
                job.idempotency_key,
                job.template_key,
                job.retry_count + 1,
                provider,
            )
        if send_data is None:
            continue
        (
            recipient,
            subject,
            html,
            text,
            idempotency_key,
            template_key,
            attempt,
            provider,
        ) = send_data
        result = provider.send(
            to=recipient,
            subject=subject,
            html=html,
            text=text,
            idempotency_key=idempotency_key,
            tags={
                "journey": template_key,
                "job_id": str(job_id),
                "attempt": str(attempt),
            },
            reply_to=settings.EMAIL_REPLY_TO or None,
        )
        with sync_session() as db:
            job = db.get(EmailJob, job_id, with_for_update=True)
            if not job or job.status != "processing":
                continue
            if result.accepted:
                job.status, job.sent_at, job.provider_message_id = (
                    "sent",
                    now,
                    result.provider_message_id,
                )
                _log(
                    db,
                    job,
                    "provider_accepted",
                    "processing",
                    "sent",
                    provider=result.provider,
                    provider_message_id=result.provider_message_id,
                    provider_metadata=result.metadata,
                )
                counts["sent"] += 1
                attempt_outcomes.append({"journey": job.template_key, "attempt_type": attempt_type,
                    "outcome": "delivered", "failure_category": "none"})
            elif result.retryable and job.retry_count < job.max_retries:
                job.retry_count += 1
                job.status, job.next_attempt_at, job.processing_started_at = (
                    "pending",
                    retry_at(job, now, retry_after_seconds=result.retry_after_seconds),
                    None,
                )
                job.send_authorized_at = None
                job.last_failure_code, job.last_failure_reason = (
                    result.failure_category,
                    result.failure_message,
                )
                _log(
                    db,
                    job,
                    "rescheduled",
                    "processing",
                    "pending",
                    provider=result.provider,
                    retryable=True,
                    failure_category=result.failure_category,
                    failure_reason=result.failure_message,
                )
                counts["retried"] += 1
                attempt_outcomes.append({"journey": job.template_key, "attempt_type": attempt_type,
                    "outcome": "retried", "failure_category": result.failure_category or "unknown"})
            else:
                job.status, job.failed_at = "dead_letter", now
                job.last_failure_code, job.last_failure_reason = (
                    result.failure_category,
                    result.failure_message,
                )
                _log(
                    db,
                    job,
                    "dead_lettered",
                    "processing",
                    "dead_letter",
                    provider=result.provider,
                    retryable=False,
                    failure_category=result.failure_category,
                    failure_reason=result.failure_message,
                )
                counts["dead_letter"] += 1
                attempt_outcomes.append({"journey": job.template_key, "attempt_type": attempt_type,
                    "outcome": "failed", "failure_category": result.failure_category or "unknown"})
    counts["attempt_outcomes"] = attempt_outcomes
    log.info("lifecycle_email_batch %s", counts)
    return counts
