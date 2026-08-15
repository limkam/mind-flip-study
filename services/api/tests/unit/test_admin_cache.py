import json
from unittest.mock import AsyncMock

import pytest

from services.admin_cache import KEY_PREFIX, get_json, invalidate, set_json


@pytest.mark.asyncio
async def test_admin_cache_round_trip_and_namespace():
    redis = AsyncMock()
    redis.get.return_value = json.dumps({"users": 12})
    assert await get_json(redis, "overview") == {"users": 12}
    await set_json(redis, "overview", {"users": 12}, 60)
    redis.setex.assert_awaited_once()
    assert redis.setex.await_args.args[0] == KEY_PREFIX + "overview"
    assert redis.setex.await_args.args[1] == 60


@pytest.mark.asyncio
async def test_admin_cache_failure_falls_back_without_raising():
    redis = AsyncMock()
    redis.get.side_effect = ConnectionError("unavailable")
    redis.setex.side_effect = ConnectionError("unavailable")
    redis.delete.side_effect = ConnectionError("unavailable")
    assert await get_json(redis, "overview") is None
    await set_json(redis, "overview", {"users": 12}, 60)
    await invalidate(redis, "overview")
