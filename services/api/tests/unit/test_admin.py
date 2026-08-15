"""Admin API route protection and response shape."""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from database import get_db
from dependencies import get_current_user
from main import app
from models.enums import UserRole
from models.user import User


def _user(*, role: UserRole) -> User:
    now = datetime.now(UTC)
    return User(
        id=uuid4(),
        email=f"{role.value}@admin-test.example",
        hashed_password="x",
        role=role,
        full_name=f"{role.value} tester",
        preferences={},
        is_banned=False,
        subscription_tier="free",
        created_at=now,
        updated_at=now,
    )


@pytest.mark.asyncio
async def test_student_cannot_access_admin_users():
    student = _user(role=UserRole.student)

    async def _student_user() -> User:
        return student

    app.dependency_overrides[get_current_user] = _student_user
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.get("/admin/users")
        assert r.status_code == 403
    finally:
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
@pytest.mark.parametrize("path", [
    "/admin/control/plan-rankings",
    "/admin/control/subscriptions",
    "/admin/control/audit-log",
    "/admin/control/onboarding-analytics",
    "/admin/control/activity-analytics",
    "/admin/control/billing-operations",
    "/admin/control/security",
    "/admin/control/credits",
    "/admin/control/content-stats",
    "/admin/control/support-analytics",
    "/admin/control/leaderboards",
    "/admin/control/learning",
])
async def test_student_cannot_access_control_center(path):
    student = _user(role=UserRole.student)
    async def _student_user(): return student
    app.dependency_overrides[get_current_user] = _student_user
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get(path)
        assert response.status_code == 403
    finally:
        app.dependency_overrides.pop(get_current_user, None)


def test_control_center_contract_is_registered_with_canonical_methods():
    paths = app.openapi()["paths"]
    expected = {
        "/admin/control/subscriptions": "get",
        "/admin/control/billing-operations": "get",
        "/admin/control/plan-rankings": "get",
        "/admin/control/users/{user_id}": "get",
        "/admin/control/audit-log": "get",
        "/admin/control/onboarding-analytics": "get",
        "/admin/control/activity-analytics": "get",
        "/admin/control/credits": "get",
        "/admin/control/content-stats": "get",
        "/admin/control/content/{book_id}": "get",
        "/admin/control/support-analytics": "get",
        "/admin/control/leaderboards": "get",
        "/admin/control/security": "get",
        "/admin/control/learning": "get",
    }
    assert {path: method in paths.get(path, {}) for path, method in expected.items()} == {
        path: True for path in expected
    }


def test_admin_user_update_schema_rejects_invalid_role():
    from pydantic import ValidationError

    from schemas.admin import AdminUserUpdate

    try:
        AdminUserUpdate(role="teacher")
        raise AssertionError("expected ValidationError")
    except ValidationError as exc:
        assert "role" in str(exc)


@pytest.mark.asyncio
async def test_admin_list_users_paginated():
    admin = _user(role=UserRole.admin)

    async def _admin_user() -> User:
        return admin

    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = []
    mock_db.execute = AsyncMock(return_value=mock_result)
    mock_db.scalar = AsyncMock(return_value=0)

    async def _get_db():
        yield mock_db

    app.dependency_overrides[get_current_user] = _admin_user
    app.dependency_overrides[get_db] = _get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.get("/admin/users?page=1&size=20")
        assert r.status_code == 200
        data = r.json()
        assert data["page"] == 1
        assert data["size"] == 20
        assert "items" in data
        assert "total" in data
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_db, None)
