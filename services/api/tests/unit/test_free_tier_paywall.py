"""FREE_TIER_PAYWALL_ENABLED setting gates tier limit enforcement."""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException

from config import settings
from dependencies import enforce_tier_limit
from models.enums import UserRole
from models.user import User


def _free_user() -> User:
    now = datetime.now(UTC)
    return User(
        id=uuid4(),
        email="free@example.com",
        hashed_password="x",
        role=UserRole.student,
        full_name="Free User",
        preferences={},
        is_banned=False,
        subscription_tier="free",
        onboarding_completed=True,
        ip_history=[],
        created_at=now,
        updated_at=now,
    )


@pytest.mark.asyncio
async def test_enforce_tier_limit_skipped_when_paywall_disabled() -> None:
    check = enforce_tier_limit("flashcard_sets")
    user = _free_user()
    mock_db = AsyncMock()

    with patch.object(settings, "FREE_TIER_PAYWALL_ENABLED", False):
        await check(user, mock_db)

    mock_db.scalar.assert_not_called()


@pytest.mark.asyncio
async def test_enforce_tier_limit_blocks_when_paywall_enabled() -> None:
    check = enforce_tier_limit("flashcard_sets")
    user = _free_user()
    mock_db = AsyncMock()
    mock_db.scalar = AsyncMock(return_value=3)

    with patch.object(settings, "FREE_TIER_PAYWALL_ENABLED", True):
        with pytest.raises(HTTPException) as exc_info:
            await check(user, mock_db)

    assert exc_info.value.status_code == 403
    assert exc_info.value.detail["code"] == "UPGRADE_REQUIRED"
