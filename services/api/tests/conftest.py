"""
Pytest setup for services/api.

- Sets required env vars before ``config`` / ``main`` import (unless already set).
- Mocks ``Redis.from_url`` so the app lifespan does not need a real Redis server.
"""

from __future__ import annotations

import os
from unittest.mock import AsyncMock, MagicMock

# Pydantic Settings reads these at import time.
os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+asyncpg://test:test@127.0.0.1:5432/mindflip_test",
)
os.environ.setdefault("REDIS_URL", "redis://127.0.0.1:6379/15")
os.environ.setdefault("JWT_SECRET", "pytest-jwt-secret-must-be-long-enough-32")


def _fake_redis(*_args, **_kwargs):
    store: dict[str, str] = {}

    class _FakePipeline:
        def __init__(self) -> None:
            self._hmget_n = 0

        def hmget(self, *_a, **_kw) -> "_FakePipeline":
            self._hmget_n += 1
            return self

        async def execute(self) -> list[list]:
            return [[None, None] for _ in range(self._hmget_n)]

    async def set_impl(name, value, nx=False, ex=None, **_kw):
        if nx:
            if name in store:
                return None
            store[name] = value
            return True
        store[name] = value
        return True

    async def incr_impl(name: str) -> int:
        cur = int(store.get(name, "0")) + 1
        store[name] = str(cur)
        return cur

    r = AsyncMock()
    r.ping = AsyncMock(return_value=True)
    r.aclose = AsyncMock()
    r.set = AsyncMock(side_effect=set_impl)
    r.setex = AsyncMock()
    r.exists = AsyncMock(return_value=0)
    r.incr = AsyncMock(side_effect=incr_impl)
    r.expire = AsyncMock(return_value=True)
    r.zcard = AsyncMock(return_value=0)
    r.zrevrange = AsyncMock(return_value=[])
    r.zrevrank = AsyncMock(return_value=None)
    r.zscore = AsyncMock(return_value=None)
    r.hmget = AsyncMock(return_value=[None, None])
    r.pipeline = MagicMock(side_effect=lambda **kwargs: _FakePipeline())
    return r


# Patch before any test module imports ``main`` (which connects in lifespan).
import redis.asyncio as redis_asyncio  # noqa: E402

redis_asyncio.Redis.from_url = staticmethod(_fake_redis)  # type: ignore[method-assign]
