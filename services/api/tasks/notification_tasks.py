"""Celery tasks for Expo push notifications and streak reminder emails."""

from __future__ import annotations

import logging
import uuid
from datetime import date, datetime, timezone

from sqlalchemy import func, select

from database_sync import sync_session
from emails.stats import email_notifications_enabled, user_streak_days
from models.quiz import QuizChallenge, StudyEvent
from models.user import User
from services.push_notifications import send_expo_push
from tasks.celery_app import celery

log = logging.getLogger(__name__)


def _utc_today() -> date:
    return datetime.now(timezone.utc).date()


@celery.task(name="tasks.notification_tasks.send_streak_reminders")
def send_streak_reminders() -> dict[str, int]:
    """Notify users who have not studied today (UTC) via push and optional email."""
    today = _utc_today()
    sent_push = 0
    sent_email = 0
    skipped = 0

    with sync_session() as db:
        users = db.execute(
            select(User).where(
                User.is_banned.is_(False),
            ),
        ).scalars().all()

        for user in users:
            studied_today = db.scalar(
                select(func.count(StudyEvent.id)).where(
                    StudyEvent.user_id == user.id,
                    func.date(StudyEvent.created_at) == today,
                ),
            )
            if studied_today and studied_today > 0:
                skipped += 1
                continue

            if user.push_token:
                ok = send_expo_push(
                    token=user.push_token,
                    title="Keep your streak!",
                    body="Study for 5 mins today 🔥",
                    data={"screen": "/(tabs)/study"},
                )
                if ok:
                    sent_push += 1

            if email_notifications_enabled(user):
                from tasks.email_tasks import send_streak_reminder_task

                streak = user_streak_days(user.id)
                send_streak_reminder_task.delay(user.full_name, user.email, streak)
                sent_email += 1

    log.info(
        "streak reminders push=%s email=%s skipped=%s",
        sent_push,
        sent_email,
        skipped,
    )
    return {"sent_push": sent_push, "sent_email": sent_email, "skipped": skipped}


@celery.task(name="tasks.notification_tasks.send_challenge_notification")
def send_challenge_notification(challenge_id: str) -> dict[str, bool]:
    """Notify challengee when a new quiz challenge is created (Expo push)."""
    try:
        cid = uuid.UUID(challenge_id)
    except ValueError:
        log.warning("invalid challenge_id for push: %s", challenge_id)
        return {"sent": False}

    with sync_session() as db:
        ch = db.get(QuizChallenge, cid)
        if ch is None:
            return {"sent": False}
        challenger = db.get(User, ch.challenger_id)
        challengee = db.get(User, ch.challengee_id)
        if challengee is None or not challengee.push_token:
            return {"sent": False}

        name = challenger.full_name if challenger else "Someone"
        ok = send_expo_push(
            token=challengee.push_token,
            title="New Challenge!",
            body=f"{name} challenged you!",
            data={
                "screen": "/(tabs)/challenges",
                "challenge_id": str(ch.id),
            },
        )
        return {"sent": ok}
