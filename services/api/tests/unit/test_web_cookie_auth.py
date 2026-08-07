"""Web HttpOnly cookie authentication and regression test suite (PAR-050)."""

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException, Response
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from models.enums import UserRole
from models.user import User
from routers.auth import _clear_refresh_cookie, _issue_login_response, _refresh_cookie_kwargs, _set_refresh_cookie


@pytest.fixture
def mock_db() -> AsyncMock:
    return AsyncMock(spec=AsyncSession)


@pytest.fixture
def mock_user() -> User:
    return User(
        id=uuid.uuid4(),
        email="web_user@example.com",
        full_name="Web User",
        role=UserRole.student,
        auth_provider="email",
        onboarding_completed=True,
        subscription_tier="free",
        preferences={},
        is_banned=False,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )


def test_refresh_cookie_kwargs_policy():
    kwargs = _refresh_cookie_kwargs(remember_me=True)
    assert kwargs["httponly"] is True
    assert kwargs["secure"] == settings.REFRESH_TOKEN_COOKIE_SECURE
    assert kwargs["samesite"] == settings.refresh_token_cookie_samesite
    assert kwargs["path"] == settings.REFRESH_TOKEN_COOKIE_PATH
    assert kwargs["max_age"] == settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400

    kwargs_session = _refresh_cookie_kwargs(remember_me=False)
    assert kwargs_session["max_age"] == settings.SESSION_REFRESH_EXPIRE_HOURS * 3600


def test_set_and_clear_refresh_cookie():
    res = Response()
    _set_refresh_cookie(res, "mock_web_refresh_jwt", remember_me=True)

    set_cookie_header = res.headers.get("set-cookie")
    assert set_cookie_header is not None
    assert "refresh_token=mock_web_refresh_jwt" in set_cookie_header
    assert "HttpOnly" in set_cookie_header

    res_clear = Response()
    _clear_refresh_cookie(res_clear)
    clear_header = res_clear.headers.get("set-cookie")
    assert clear_header is not None
    assert "refresh_token=" in clear_header


@pytest.mark.asyncio
async def test_web_issue_login_response_sets_cookie_and_hides_raw_token(mock_db: AsyncMock, mock_user: User):
    res = Response()
    req_web = MagicMock()
    req_web.headers = {"origin": "http://localhost:5173"}

    login_res = await _issue_login_response(
        user=mock_user,
        response=res,
        db=mock_db,
        request=req_web,
        remember_me=True,
        client=None,
    )

    # 1. Response JSON refresh_token MUST be None for web
    assert login_res.refresh_token is None
    assert login_res.access_token is not None

    # 2. HttpOnly Cookie MUST be present
    set_cookie_header = res.headers.get("set-cookie")
    assert set_cookie_header is not None
    assert "refresh_token=" in set_cookie_header
    assert "HttpOnly" in set_cookie_header


@pytest.mark.asyncio
async def test_browser_request_requesting_mobile_client_is_blocked(mock_db: AsyncMock, mock_user: User):
    res = Response()
    req_browser = MagicMock()
    req_browser.headers = {"origin": "http://localhost:5173", "sec-fetch-mode": "cors"}

    with pytest.raises(HTTPException) as exc_info:
        await _issue_login_response(
            user=mock_user,
            response=res,
            db=mock_db,
            request=req_browser,
            remember_me=True,
            client="mobile",
        )

    assert exc_info.value.status_code == 400
    assert "forbidden" in exc_info.value.detail.lower()
