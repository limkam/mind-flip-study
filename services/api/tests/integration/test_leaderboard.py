"""Leaderboard integration tests."""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest
from httpx import ASGITransport, AsyncClient

from dependencies import get_current_user, get_redis
from main import app
from models.enums import UserRole
from models.user import User


def _student() -> User:
    now = datetime.now(UTC)
    return User(
        id=__import__("uuid").uuid4(),
        email="lb@test.example",
        hashed_password="x",
        role=UserRole.student,
        full_name="LB",
        preferences={},
        is_banned=False,
        subscription_tier="free",
        created_at=now,
        updated_at=now,
    )


@pytest.mark.asyncio
async def test_leaderboard_uses_redis():
    student = _student()
    mock_redis = AsyncMock()
    mock_redis.zrevrange = AsyncMock(return_value=[])
    mock_redis.zcard = AsyncMock(return_value=0)
    mock_pipe = MagicMock()
    mock_pipe.hmget = MagicMock(return_value=mock_pipe)
    mock_pipe.execute = AsyncMock(return_value=[])
    mock_redis.pipeline = MagicMock(return_value=mock_pipe)

    async def _user() -> User:
        return student

    async def _redis_dep() -> AsyncMock:
        return mock_redis

    app.dependency_overrides[get_current_user] = _user
    app.dependency_overrides[get_redis] = _redis_dep
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.get("/leaderboard")
        assert r.status_code == 200
        mock_redis.zrevrange.assert_called_once()
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_redis, None)


@pytest.mark.asyncio
async def test_leaderboard_pagination():
    student = _student()
    mock_redis = AsyncMock()
    mock_redis.zrevrange = AsyncMock(return_value=[])
    mock_redis.zcard = AsyncMock(return_value=0)
    mock_pipe = MagicMock()
    mock_pipe.hmget = MagicMock(return_value=mock_pipe)
    mock_pipe.execute = AsyncMock(return_value=[])
    mock_redis.pipeline = MagicMock(return_value=mock_pipe)

    async def _user() -> User:
        return student

    async def _redis_dep() -> AsyncMock:
        return mock_redis

    app.dependency_overrides[get_current_user] = _user
    app.dependency_overrides[get_redis] = _redis_dep
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.get("/leaderboard?page=1&size=10")
        assert r.status_code == 200
        data = r.json()
        assert "items" in data
        assert "total" in data
        assert len(data["items"]) <= 10
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_redis, None)
