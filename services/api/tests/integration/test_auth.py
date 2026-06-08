"""Auth integration tests."""

from __future__ import annotations

from datetime import UTC, datetime
import pytest
from httpx import ASGITransport, AsyncClient

from dependencies import get_current_user
from main import app
from models.enums import UserRole
from models.user import User


def _user(*, role: UserRole = UserRole.student, banned: bool = False) -> User:
    now = datetime.now(UTC)
    return User(
        id=__import__("uuid").uuid4(),
        email=f"{role.value}@auth-test.example",
        hashed_password="x",
        role=role,
        full_name="Auth Tester",
        preferences={},
        is_banned=banned,
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

