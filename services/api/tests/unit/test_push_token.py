"""Push token registration and Expo push helper."""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from dependencies import get_current_user, get_db
from main import app
from models.enums import UserRole
from models.user import User


def _student() -> User:
    now = datetime.now(UTC)
    return User(
        id=uuid4(),
        email="push@test.example",
        hashed_password="x",
        role=UserRole.student,
        full_name="Push Tester",
        preferences={},
        is_banned=False,
        subscription_tier="free",
        created_at=now,
        updated_at=now,
    )


@pytest.mark.asyncio
async def test_register_push_token():
    user = _student()
    mock_db = AsyncMock()
    mock_db.commit = AsyncMock()

    async def _user():
        return user

    async def _get_db():
        yield mock_db

    app.dependency_overrides[get_current_user] = _user
    app.dependency_overrides[get_db] = _get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.post(
                "/users/me/push-token",
                json={"token": "ExponentPushToken[test]", "platform": "ios"},
            )
        assert r.status_code == 200
        assert r.json()["registered"] is True
        assert user.push_token == "ExponentPushToken[test]"
        assert user.push_platform == "ios"
        mock_db.commit.assert_awaited_once()
    finally:
        app.dependency_overrides.clear()


def test_send_expo_push_success():
    from services.push_notifications import send_expo_push

    mock_resp = MagicMock()
    mock_resp.raise_for_status = MagicMock()
    mock_resp.json.return_value = {"data": [{"status": "ok"}]}

    with patch("services.push_notifications.httpx.Client") as client_cls:
        client_cls.return_value.__enter__.return_value.post.return_value = mock_resp
        assert send_expo_push(token="ExponentPushToken[x]", title="Hi", body="There") is True
