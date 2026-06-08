"""Refresh XP leaderboard in Redis from PostgreSQL (Celery worker)."""

from __future__ import annotations

import logging

import redis
from sqlalchemy import func, select

from config import settings
from database_sync import sync_session
from models.quiz import QuizResult
from models.user import User
from tasks.celery_app import celery

log = logging.getLogger(__name__)

LEADERBOARD_KEY = "leaderboard:xp"
USER_META_PREFIX = "user:meta:"
USER_META_TTL_SEC = 600


def _redis() -> redis.Redis:
    return redis.Redis.from_url(settings.REDIS_URL, decode_responses=True)


@celery.task(name="tasks.leaderboard_tasks.refresh_leaderboard_task")
def refresh_leaderboard_task() -> dict[str, int]:
    """Rebuild sorted set and user metadata hashes from quiz XP totals.

    Redis ZADD mapping is ``{member: score}`` in redis-py: member = user_id (str),
    score = total XP (float). ZREVRANGE then orders highest score first.

    One ``MULTI/EXEC`` pipeline refreshes leaderboard + meta hashes together so
    clients never see a new ZSET with stale metadata from a half-applied refresh.
    """
    r = _redis()
    with sync_session() as db:
        stmt = (
            select(
                User.id,
                User.full_name,
                User.avatar_url,
                func.coalesce(func.sum(QuizResult.score), 0).label("xp"),
            )
            .outerjoin(QuizResult, QuizResult.user_id == User.id)
            .group_by(User.id, User.full_name, User.avatar_url)
        )
        rows = db.execute(stmt).all()

    # redis-py: zadd(key, mapping={member: score, ...})
    zmapping: dict[str, float] = {}
    for row in rows:
        uid = str(row.id)
        zmapping[uid] = float(row.xp or 0)

    pipe = r.pipeline(transaction=True)
    pipe.delete(LEADERBOARD_KEY)
    if zmapping:
        pipe.zadd(LEADERBOARD_KEY, zmapping)
    for row in rows:
        uid = str(row.id)
        meta_key = f"{USER_META_PREFIX}{uid}"
        pipe.hset(
            meta_key,
            mapping={
                "full_name": row.full_name or "",
                "avatar_url": row.avatar_url or "",
            },
        )
        pipe.expire(meta_key, USER_META_TTL_SEC)
    pipe.execute()

    log.info("leaderboard refresh: %s users", len(zmapping))
    return {"users": len(zmapping)}
