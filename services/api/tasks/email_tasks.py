"""Celery tasks for transactional email (Resend)."""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select

from database_sync import sync_session
from emails.sender import send_email
from emails.stats import compute_weekly_stats, email_notifications_enabled, user_streak_days
from emails.templates.challenge import challenge_alert_email
from emails.templates.password_reset import password_reset_email
from emails.templates.streak import streak_reminder_email
from emails.templates.welcome import welcome_email
from emails.templates.weekly_digest import weekly_digest_email
from models.quiz import StudyEvent
from models.user import User
from tasks.celery_app import celery

log = logging.getLogger(__name__)


@celery.task(name="tasks.email_tasks.send_welcome_email_task")
def send_welcome_email_task(full_name: str, email: str) -> bool:
    html = welcome_email(full_name, email)
    return send_email(to=email, subject="Welcome to MindFlip 🎉", html=html)


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
        users = db.execute(
            select(User).where(User.is_banned.is_(False)),
        ).scalars().all()

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
            send_weekly_digest_email_task.delay(
                user.full_name,
                user.email,
                stats,
            )
            queued += 1

    log.info("weekly digests queued=%s skipped=%s", queued, skipped)
    return {"queued": queued, "skipped": skipped}


@celery.task(name="tasks.email_tasks.send_weekly_digest_email_task")
def send_weekly_digest_email_task(full_name: str, email: str, stats: dict) -> bool:
    html = weekly_digest_email(full_name, stats)
    return send_email(to=email, subject="Your MindFlip week in review 📊", html=html)
