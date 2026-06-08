"""Banned user guard on get_current_user."""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from fastapi import HTTPException

from dependencies import get_current_user
from jwt_tokens import create_access_token
from models.enums import UserRole
from models.user import User


@pytest.mark.asyncio
async def test_get_current_user_rejects_banned():
    user_id = uuid4()
    banned = User(
        id=user_id,
        email="banned@test.example",
        hashed_password="x",
        role=UserRole.student,
        full_name="Banned",
        preferences={},
        is_banned=True,
        subscription_tier="free",
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = banned
    mock_db = AsyncMock()
    mock_db.execute = AsyncMock(return_value=mock_result)

    token = create_access_token(subject=user_id)
    creds = MagicMock()
    creds.credentials = token

    with pytest.raises(HTTPException) as exc:
        await get_current_user(credentials=creds, db=mock_db)
    assert exc.value.status_code == 403
    assert "suspended" in str(exc.value.detail).lower()
