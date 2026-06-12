"""Refresh leaderboard caches in Redis from PostgreSQL (Celery worker)."""

from __future__ import annotations

import logging

import redis
from sqlalchemy import and_, case, func, or_, select

from config import settings
from database_sync import sync_session
from models.quiz import CardProgress, QuizResult
from models.user import User
from tasks.celery_app import celery
from user_identity import resolve_display_name

log = logging.getLogger(__name__)

USER_META_PREFIX = "user:meta:"
USER_META_TTL_SEC = 86_400  # 24h — longer than previous 10m to avoid stale ZSET / missing meta

METRIC_KEYS = {
    "avg_score": "leaderboard:avg_score",
    "most_quizzes": "leaderboard:most_quizzes",
    "cards_mastered": "leaderboard:cards_mastered",
    "xp": "leaderboard:xp",
}


def _redis() -> redis.Redis:
    return redis.Redis.from_url(settings.REDIS_URL, decode_responses=True)


def _mastered_filter():
    return or_(
        CardProgress.repetitions >= 3,
        and_(CardProgress.repetitions >= 1, CardProgress.ease_factor >= 2.5),
    )


def _avg_score_expr():
    return case(
        (QuizResult.total_questions > 0, QuizResult.score * 100.0 / QuizResult.total_questions),
        else_=0.0,
    )


@celery.task(name="tasks.leaderboard_tasks.refresh_leaderboard_task")
def refresh_leaderboard_task() -> dict[str, int]:
    """Rebuild sorted sets and user metadata (full_name + email) for all leaderboard metrics."""
    r = _redis()
    with sync_session() as db:
        users = db.execute(
            select(User.id, User.full_name, User.email, User.avatar_url).where(User.is_banned.is_(False)),
        ).all()

        pct = _avg_score_expr()
        avg_rows = db.execute(
            select(User.id, func.avg(pct).label("v"))
            .join(QuizResult, QuizResult.user_id == User.id)
            .group_by(User.id)
            .having(func.count(QuizResult.id) > 0),
        ).all()

        quiz_rows = db.execute(
            select(User.id, func.count(QuizResult.id).label("v"))
            .join(QuizResult, QuizResult.user_id == User.id)
            .group_by(User.id)
            .having(func.count(QuizResult.id) > 0),
        ).all()

        card_rows = db.execute(
            select(User.id, func.count(CardProgress.id).label("v"))
            .join(CardProgress, CardProgress.user_id == User.id)
            .where(_mastered_filter())
            .group_by(User.id)
            .having(func.count(CardProgress.id) > 0),
        ).all()

        xp_rows = db.execute(
            select(User.id, func.coalesce(func.sum(QuizResult.score), 0).label("v"))
            .join(QuizResult, QuizResult.user_id == User.id)
            .group_by(User.id)
            .having(func.coalesce(func.sum(QuizResult.score), 0) > 0),
        ).all()

    metric_data = {
        "avg_score": {str(row.id): float(row.v or 0) for row in avg_rows},
        "most_quizzes": {str(row.id): float(row.v or 0) for row in quiz_rows},
        "cards_mastered": {str(row.id): float(row.v or 0) for row in card_rows},
        "xp": {str(row.id): float(row.v or 0) for row in xp_rows},
    }

    pipe = r.pipeline(transaction=True)
    for metric, key in METRIC_KEYS.items():
        pipe.delete(key)
        mapping = metric_data[metric]
        if mapping:
            pipe.zadd(key, mapping)

    for row in users:
        uid = str(row.id)
        display = resolve_display_name(full_name=row.full_name, email=row.email)
        meta_key = f"{USER_META_PREFIX}{uid}"
        pipe.hset(
            meta_key,
            mapping={
                "full_name": display,
                "email": row.email or "",
                "avatar_url": row.avatar_url or "",
            },
        )
        pipe.expire(meta_key, USER_META_TTL_SEC)
    pipe.execute()

    total = sum(len(m) for m in metric_data.values())
    log.info("leaderboard refresh: %s user-metric entries", total)
    return {"entries": total}
