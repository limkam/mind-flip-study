"""Redis cache for long-running Celery job status and progress."""

from __future__ import annotations

import json
import logging

import redis

from config import settings

log = logging.getLogger(__name__)

REDIS_JOB_PREFIX = "mindflip:job:"
JOB_CACHE_TTL_SECONDS = 7200


def _redis() -> redis.Redis:
    return redis.Redis.from_url(settings.REDIS_URL, decode_responses=True)


def cache_job(task_id: str, payload: dict) -> None:
    try:
        _redis().setex(REDIS_JOB_PREFIX + task_id, JOB_CACHE_TTL_SECONDS, json.dumps(payload))
    except Exception as exc:  # pragma: no cover
        log.warning("job_redis_cache_failed", extra={"task_id": task_id, "error": str(exc)})


def get_cached_job(task_id: str) -> dict | None:
    try:
        raw = _redis().get(REDIS_JOB_PREFIX + task_id)
        if raw is not None and isinstance(raw, (str, bytes)):
            return json.loads(raw)
    except Exception as exc:
        log.warning("job_redis_read_failed", extra={"task_id": task_id, "error": str(exc)})
    return None
