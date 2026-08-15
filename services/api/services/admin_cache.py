"""Resilient, observable Redis cache for non-authoritative admin aggregates."""
from __future__ import annotations
from functools import wraps
import json
import logging
import time
from typing import Any, Callable
from fastapi.encoders import jsonable_encoder

logger = logging.getLogger("mindflip.admin_cache")
KEY_PREFIX = "mindflip:admin:v1:"

async def get_json(redis: Any, key: str) -> Any | None:
    started = time.perf_counter()
    try:
        raw = await redis.get(KEY_PREFIX + key)
        elapsed = (time.perf_counter() - started) * 1000
        logger.info("admin_cache_%s key=%s latency_ms=%.1f", "hit" if raw is not None else "miss", key, elapsed)
        return json.loads(raw) if raw is not None else None
    except Exception as exc:
        logger.warning("admin_cache_error operation=get key=%s error=%s", key, type(exc).__name__)
        return None

async def set_json(redis: Any, key: str, value: Any, ttl: int) -> None:
    started = time.perf_counter()
    try:
        await redis.setex(KEY_PREFIX + key, ttl, json.dumps(jsonable_encoder(value), separators=(",", ":")))
        logger.info("admin_cache_store key=%s ttl=%s latency_ms=%.1f", key, ttl, (time.perf_counter() - started) * 1000)
    except Exception as exc:
        logger.warning("admin_cache_error operation=set key=%s error=%s", key, type(exc).__name__)

async def invalidate(redis: Any, *keys: str) -> None:
    try:
        if keys:
            await redis.delete(*(KEY_PREFIX + key for key in keys))
            logger.info("admin_cache_invalidate count=%s", len(keys))
    except Exception as exc:
        logger.warning("admin_cache_error operation=invalidate error=%s", type(exc).__name__)

def cached_admin_response(key: str, ttl: int) -> Callable:
    """Cache a GET aggregate; endpoint must accept a FastAPI ``request`` argument."""
    def decorate(endpoint: Callable) -> Callable:
        @wraps(endpoint)
        async def wrapped(*args, **kwargs):
            request = kwargs.get("request")
            redis = getattr(getattr(getattr(request, "app", None), "state", None), "redis", None)
            cached = await get_json(redis, key) if redis is not None else None
            if cached is not None:
                return cached
            result = await endpoint(*args, **kwargs)
            if redis is not None:
                await set_json(redis, key, result, ttl)
            return result
        return wrapped
    return decorate
