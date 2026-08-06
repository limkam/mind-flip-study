"""Route integration tests for POST /study/events endpoint."""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from dependencies import get_current_user, get_db
from main import app
from models.enums import UserRole
from models.user import User


def _mock_user() -> User:
    now = datetime.now(UTC)
    return User(
        id=uuid4(),
        email="test-analytics@example.com",
        hashed_password="hashed_pass",
        role=UserRole.student,
        full_name="Analytics User",
        preferences={},
        is_banned=False,
        subscription_tier="free",
        created_at=now,
        updated_at=now,
    )


@pytest.mark.asyncio
async def test_post_study_event_authenticated_success():
    user = _mock_user()
    mock_db = AsyncMock()

    async def _override_user() -> User:
        return user

    async def _override_db():
        yield mock_db

    app.dependency_overrides[get_current_user] = _override_user
    app.dependency_overrides[get_db] = _override_db
    try:
        test_set_id = str(uuid4())
        payload = {
            "event_type": "game_save_error",
            "set_id": test_set_id,
            "metadata": {
                "game_type": "memory_match",
                "mode": "game",
                "error_category": "network",
                "user_id": "forged_client_user_id",  # client forgery attempt
            },
        }
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.post("/study/events", json=payload)

        assert r.status_code == 204
        # Verify db.add was called with StudyEvent associated with authenticated user.id
        assert mock_db.add.called
        added_event = mock_db.add.call_args[0][0]
        assert added_event.user_id == user.id
        assert str(added_event.set_id) == test_set_id
        assert added_event.event_type == "game_save_error"
        assert mock_db.commit.called
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_post_study_event_unauthenticated_rejected():
    payload = {
        "event_type": "game_save_error",
        "metadata": {"mode": "game"},
    }
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        r = await client.post("/study/events", json=payload)

    assert r.status_code in (401, 403)


@pytest.mark.asyncio
async def test_post_study_event_malformed_event_type():
    user = _mock_user()
    mock_db = AsyncMock()

    async def _override_user() -> User:
        return user

    async def _override_db():
        yield mock_db

    app.dependency_overrides[get_current_user] = _override_user
    app.dependency_overrides[get_db] = _override_db
    try:
        # Event type exceeding 64 chars
        payload = {
            "event_type": "a" * 65,
            "metadata": {"mode": "game"},
        }
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.post("/study/events", json=payload)

        assert r.status_code == 422
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_db, None)
