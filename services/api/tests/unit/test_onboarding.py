"""Onboarding endpoint and schema validation."""

from __future__ import annotations

from datetime import UTC, date, datetime
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from pydantic import ValidationError

from dependencies import get_current_user, get_db
from main import app
from models.enums import UserRole
from models.user import User
from schemas.auth import OnboardingRequest


def _user(*, completed: bool = False) -> User:
    now = datetime.now(UTC)
    return User(
        id=uuid4(),
        email="onboard@example.com",
        hashed_password="x",
        role=UserRole.student,
        full_name="Onboard Test",
        preferences={},
        is_banned=False,
        subscription_tier="free",
        onboarding_completed=completed,
        ip_history=[],
        created_at=now,
        updated_at=now,
    )


def test_onboarding_schema_rejects_future_dob() -> None:
    with pytest.raises(ValidationError):
        OnboardingRequest(
            date_of_birth=date(2099, 1, 1),
            country="United States",
            occupation="Student",
        )


@pytest.mark.asyncio
async def test_onboarding_endpoint_sets_profile() -> None:
    user = _user(completed=False)
    mock_db = AsyncMock()

    async def _user_dep() -> User:
        return user

    async def _db_dep():
        yield mock_db

    app.dependency_overrides[get_current_user] = _user_dep
    app.dependency_overrides[get_db] = _db_dep
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.post(
                "/auth/onboarding",
                json={
                    "date_of_birth": "2004-06-08",
                    "country": "United States",
                    "occupation": "Student",
                },
            )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["onboarding_completed"] is True
        assert user.date_of_birth == date(2004, 6, 8)
        assert user.country == "United States"
        assert user.occupation == "Student"
        assert user.continent == "North America"
        assert data["age"] is not None
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_onboarding_rejects_future_dob() -> None:
    user = _user(completed=False)
    mock_db = AsyncMock()

    async def _user_dep() -> User:
        return user

    async def _db_dep():
        yield mock_db

    app.dependency_overrides[get_current_user] = _user_dep
    app.dependency_overrides[get_db] = _db_dep
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.post(
                "/auth/onboarding",
                json={
                    "date_of_birth": "2099-01-01",
                    "country": "United States",
                    "occupation": "Student",
                },
            )
        assert r.status_code == 422, r.text
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_db, None)
