"""PATCH /users/me must enforce the same 13+ age floor as signup/onboarding.

Regression test: this endpoint previously validated date_of_birth with
validate_date_of_birth (future/120-year bounds only), so an already-onboarded
user could patch their DOB down to an under-13 value with no rejection.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from dependencies import get_current_user, get_db
from main import app
from models.enums import UserRole
from models.user import User


def _onboarded_user() -> User:
    now = datetime.now(UTC)
    return User(
        id=uuid4(),
        email="patch-age@test.example",
        hashed_password="x",
        role=UserRole.student,
        full_name="Patch Tester",
        auth_provider="email",
        preferences={},
        is_banned=False,
        subscription_tier="free",
        onboarding_completed=True,
        date_of_birth=date(1990, 1, 1),
        created_at=now,
        updated_at=now,
    )


def _under_thirteen_dob() -> date:
    tomorrow = date.today() + timedelta(days=1)
    return tomorrow.replace(year=tomorrow.year - 13)


@pytest.mark.asyncio
async def test_patch_me_rejects_under_thirteen_dob():
    user = _onboarded_user()
    mock_db = AsyncMock()

    async def _user_dep():
        return user

    async def _db_dep():
        yield mock_db

    app.dependency_overrides[get_current_user] = _user_dep
    app.dependency_overrides[get_db] = _db_dep
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.patch("/users/me", json={"date_of_birth": _under_thirteen_dob().isoformat()})
        assert r.status_code == 422, r.text
        assert "13 and above" in r.text
        assert user.date_of_birth == date(1990, 1, 1)
        mock_db.commit.assert_not_awaited()
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_patch_me_accepts_valid_adult_dob():
    user = _onboarded_user()
    mock_db = AsyncMock()

    async def _user_dep():
        return user

    async def _db_dep():
        yield mock_db

    app.dependency_overrides[get_current_user] = _user_dep
    app.dependency_overrides[get_db] = _db_dep
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.patch("/users/me", json={"date_of_birth": "1995-05-05"})
        assert r.status_code == 200, r.text
        assert user.date_of_birth == date(1995, 5, 5)
    finally:
        app.dependency_overrides.clear()
