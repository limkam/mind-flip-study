"""Leaderboard integration tests."""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import get_current_user
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


def _mock_db_session() -> AsyncMock:
    mock_db = AsyncMock(spec=AsyncSession)
    count_result = MagicMock()
    count_result.scalar.return_value = 0
    empty_result = MagicMock()
    empty_result.all.return_value = []
    mock_db.execute = AsyncMock(side_effect=[count_result, empty_result])
    return mock_db


@pytest.mark.asyncio
async def test_leaderboard_queries_database():
    student = _student()
    mock_db = _mock_db_session()

    async def _user() -> User:
        return student

    async def _db_dep() -> AsyncMock:
        return mock_db

    app.dependency_overrides[get_current_user] = _user
    app.dependency_overrides[get_db] = _db_dep
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.get("/leaderboard")
        assert r.status_code == 200
        data = r.json()
        assert data["metric"] == "avg_score"
        assert mock_db.execute.await_count >= 1
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_leaderboard_pagination():
    student = _student()
    mock_db = _mock_db_session()

    async def _user() -> User:
        return student

    async def _db_dep() -> AsyncMock:
        return mock_db

    app.dependency_overrides[get_current_user] = _user
    app.dependency_overrides[get_db] = _db_dep
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.get("/leaderboard?page=1&size=10&metric=most_quizzes")
        assert r.status_code == 200
        data = r.json()
        assert "items" in data
        assert "total" in data
        assert data["metric"] == "most_quizzes"
        assert len(data["items"]) <= 10
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_db, None)
