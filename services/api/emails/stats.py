"""Sync helpers for weekly digest and streak email stats."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from uuid import UUID

from sqlalchemy import Date, cast, func, select

from database_sync import sync_session
from models.quiz import QuizResult, StudyEvent
from models.user import User

LEADERBOARD_KEY = "leaderboard:xp"


def _streak_from_day_set(day_set: set[date], today: date) -> int:
    count = 0
    for i in range(400):
        d = today - timedelta(days=i)
        if d in day_set:
            count += 1
        elif i > 0:
            break
    return count


def compute_weekly_stats(user_id: UUID) -> dict:
    """Stats for the last 7 days (UTC)."""
    now = datetime.now(UTC)
    today = now.date()
    since = now - timedelta(days=7)
    since_30 = now - timedelta(days=30)

    with sync_session() as db:
        cards_reviewed = int(
            db.scalar(
                select(func.count(StudyEvent.id)).where(
                    StudyEvent.user_id == user_id,
                    StudyEvent.created_at >= since,
                ),
            )
            or 0,
        )

        avg_row = db.execute(
            select(
                func.avg(100.0 * QuizResult.score / func.nullif(QuizResult.total_questions, 0)),
            ).where(
                QuizResult.user_id == user_id,
                QuizResult.completed_at >= since,
            ),
        ).one()
        avg_score = round(float(avg_row[0] or 0), 1)

        sets_completed = int(
            db.scalar(
                select(func.count(func.distinct(QuizResult.set_id))).where(
                    QuizResult.user_id == user_id,
                    QuizResult.completed_at >= since,
                ),
            )
            or 0,
        )

        dates = db.scalars(
            select(cast(QuizResult.completed_at, Date))
            .where(
                QuizResult.user_id == user_id,
                QuizResult.completed_at >= now - timedelta(days=400),
            )
            .distinct(),
        ).all()
        streak_days = _streak_from_day_set(set(dates), today)

        active_30d = int(
            db.scalar(
                select(func.count(StudyEvent.id)).where(
                    StudyEvent.user_id == user_id,
                    StudyEvent.created_at >= since_30,
                ),
            )
            or 0,
        )

    rank: int | None = None
    try:
        import redis

        from config import settings

        r = redis.from_url(settings.REDIS_URL, decode_responses=True)
        rev_rank = r.zrevrank(LEADERBOARD_KEY, str(user_id))
        if rev_rank is not None:
            rank = int(rev_rank) + 1
    except Exception:
        rank = None

    return {
        "cards_reviewed": cards_reviewed,
        "avg_score": avg_score,
        "streak_days": streak_days,
        "rank": rank,
        "sets_completed": sets_completed,
        "active_30d": active_30d,
    }


def user_streak_days(user_id: UUID) -> int:
    return compute_weekly_stats(user_id)["streak_days"]


def email_notifications_enabled(user: User, *, weekly_digest: bool = False) -> bool:
    settings_prefs = (user.preferences or {}).get("settings") or {}
    if weekly_digest:
        return settings_prefs.get("notify_weekly_digest", True)
    return settings_prefs.get("notify_streak_reminder", True)
