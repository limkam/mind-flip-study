"""require_role dependency unit tests."""

import pytest
from fastapi import HTTPException
from unittest.mock import MagicMock

from dependencies import require_role
from models.enums import UserRole


def make_user(role: UserRole):
    u = MagicMock()
    u.role = role
    return u


@pytest.mark.asyncio
async def test_admin_can_access_admin_route():
    checker = require_role("admin")
    user = make_user(UserRole.admin)
    await checker(current_user=user)


@pytest.mark.asyncio
async def test_student_cannot_access_admin_route():
    checker = require_role("admin")
    user = make_user(UserRole.student)
    with pytest.raises(HTTPException) as exc:
        await checker(current_user=user)
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_student_can_access_student_route():
    checker = require_role("student", "admin")
    user = make_user(UserRole.student)
    await checker(current_user=user)
