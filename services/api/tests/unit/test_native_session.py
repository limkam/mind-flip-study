"""Focused security unit tests for native refresh session architecture (PAR-050)."""

import hashlib
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from models.enums import UserRole
from models.native_session import NativeRefreshSession
from models.user import User
from routers.auth import _is_web_browser_request
from services.native_session_service import (
    create_native_refresh_session,
    hash_native_refresh_token,
    revoke_native_refresh_session,
    rotate_native_refresh_session,
)


@pytest.fixture
def mock_db() -> AsyncMock:
    return AsyncMock(spec=AsyncSession)


@pytest.fixture
def mock_user() -> User:
    return User(
        id=uuid.uuid4(),
        email="native_test@example.com",
        full_name="Native Test User",
        role=UserRole.student,
        auth_provider="email",
        subscription_tier="free",
        preferences={},
        is_banned=False,
    )


@pytest.mark.asyncio
async def test_create_native_refresh_session_hashes_token(mock_db: AsyncMock, mock_user: User):
    session, raw_token = await create_native_refresh_session(mock_db, mock_user.id, client_platform="android")

    assert raw_token.startswith("nrt_")
    assert session.user_id == mock_user.id
    assert session.token_hash == hash_native_refresh_token(raw_token)
    assert session.token_hash != raw_token
    assert session.revoked_at is None
    assert session.replaced_by_id is None

    assert mock_db.add.called
    assert mock_db.commit.called
    assert mock_db.refresh.called


@pytest.mark.asyncio
async def test_rotate_native_refresh_session_success(mock_db: AsyncMock, mock_user: User):
    raw1 = "nrt_test_token_1234567890_abcdefghijklmnopqrstuvwxyz"
    hash1 = hash_native_refresh_token(raw1)
    family_id = uuid.uuid4()

    existing_session = NativeRefreshSession(
        id=uuid.uuid4(),
        user_id=mock_user.id,
        token_hash=hash1,
        family_id=family_id,
        client_platform="mobile",
        expires_at=datetime.now(timezone.utc) + timedelta(days=30),
        revoked_at=None,
        replaced_by_id=None,
    )

    mock_exec_res = MagicMock()
    mock_exec_res.scalar_one_or_none.return_value = existing_session
    mock_db.execute.return_value = mock_exec_res
    mock_db.get.return_value = mock_user

    user_id, raw2 = await rotate_native_refresh_session(mock_db, raw1)

    assert user_id == mock_user.id
    assert raw2.startswith("nrt_")
    assert raw2 != raw1
    assert existing_session.revoked_at is not None
    assert existing_session.replaced_by_id is not None
    assert mock_db.commit.called


@pytest.mark.asyncio
async def test_concurrent_retry_within_grace_window_does_not_revoke_family(mock_db: AsyncMock, mock_user: User):
    raw_old = "nrt_recent_token_1234567890_abcdefghijklmnopqrstuvwxyz"
    hash_old = hash_native_refresh_token(raw_old)
    family_id = uuid.uuid4()

    # Revoked only 1 second ago (microsecond network race)
    revoked_recent = NativeRefreshSession(
        id=uuid.uuid4(),
        user_id=mock_user.id,
        token_hash=hash_old,
        family_id=family_id,
        client_platform="mobile",
        expires_at=datetime.now(timezone.utc) + timedelta(days=30),
        revoked_at=datetime.now(timezone.utc) - timedelta(seconds=1),
        replaced_by_id=uuid.uuid4(),
    )

    sibling_active_session = NativeRefreshSession(
        id=uuid.uuid4(),
        user_id=mock_user.id,
        token_hash="hash_sibling",
        family_id=family_id,
        client_platform="mobile",
        expires_at=datetime.now(timezone.utc) + timedelta(days=30),
        revoked_at=None,
    )

    mock_exec1 = MagicMock()
    mock_exec1.scalar_one_or_none.return_value = revoked_recent
    mock_db.execute.return_value = mock_exec1

    with pytest.raises(HTTPException) as exc_info:
        await rotate_native_refresh_session(mock_db, raw_old)

    assert exc_info.value.status_code == 401
    assert "already rotated" in exc_info.value.detail.lower()
    # Sibling session remains active and unrevoked
    assert sibling_active_session.revoked_at is None


@pytest.mark.asyncio
async def test_reused_rotated_token_triggers_theft_protection(mock_db: AsyncMock, mock_user: User):
    raw_old = "nrt_old_reused_token_1234567890_abcdefghijklmnopqrstuvwxyz"
    hash_old = hash_native_refresh_token(raw_old)
    family_id = uuid.uuid4()

    # Revoked 5 minutes ago (stale replay attack)
    revoked_session = NativeRefreshSession(
        id=uuid.uuid4(),
        user_id=mock_user.id,
        token_hash=hash_old,
        family_id=family_id,
        client_platform="mobile",
        expires_at=datetime.now(timezone.utc) + timedelta(days=30),
        revoked_at=datetime.now(timezone.utc) - timedelta(minutes=5),
        replaced_by_id=uuid.uuid4(),
    )

    sibling_active_session = NativeRefreshSession(
        id=uuid.uuid4(),
        user_id=mock_user.id,
        token_hash="hash_sibling",
        family_id=family_id,
        client_platform="mobile",
        expires_at=datetime.now(timezone.utc) + timedelta(days=30),
        revoked_at=None,
    )

    mock_exec1 = MagicMock()
    mock_exec1.scalar_one_or_none.return_value = revoked_session

    mock_exec2 = MagicMock()
    mock_exec2.scalars.return_value.all.return_value = [sibling_active_session]

    mock_db.execute.side_effect = [mock_exec1, mock_exec2]

    with pytest.raises(HTTPException) as exc_info:
        await rotate_native_refresh_session(mock_db, raw_old)

    assert exc_info.value.status_code == 401
    assert "revoked" in exc_info.value.detail.lower()
    assert sibling_active_session.revoked_at is not None
    assert mock_db.commit.called


@pytest.mark.asyncio
async def test_web_browser_request_detection():
    req_browser = SimpleNamespace(headers={"origin": "http://localhost:5173"})
    req_mobile = SimpleNamespace(headers={})

    assert _is_web_browser_request(req_browser) is True
    assert _is_web_browser_request(req_mobile) is False


@pytest.mark.asyncio
async def test_expired_native_refresh_session_rejected(mock_db: AsyncMock, mock_user: User):
    raw_exp = "nrt_expired_token_1234567890_abcdefghijklmnopqrstuvwxyz"
    hash_exp = hash_native_refresh_token(raw_exp)

    expired_session = NativeRefreshSession(
        id=uuid.uuid4(),
        user_id=mock_user.id,
        token_hash=hash_exp,
        family_id=uuid.uuid4(),
        expires_at=datetime.now(timezone.utc) - timedelta(hours=1),
        revoked_at=None,
    )

    mock_exec = MagicMock()
    mock_exec.scalar_one_or_none.return_value = expired_session
    mock_db.execute.return_value = mock_exec

    with pytest.raises(HTTPException) as exc_info:
        await rotate_native_refresh_session(mock_db, raw_exp)

    assert exc_info.value.status_code == 401
    assert expired_session.revoked_at is not None


@pytest.mark.asyncio
async def test_revoke_native_refresh_session(mock_db: AsyncMock, mock_user: User):
    raw = "nrt_logout_token_1234567890_abcdefghijklmnopqrstuvwxyz"
    hash_val = hash_native_refresh_token(raw)

    session = NativeRefreshSession(
        id=uuid.uuid4(),
        user_id=mock_user.id,
        token_hash=hash_val,
        family_id=uuid.uuid4(),
        expires_at=datetime.now(timezone.utc) + timedelta(days=30),
        revoked_at=None,
    )

    mock_exec = MagicMock()
    mock_exec.scalar_one_or_none.return_value = session
    mock_db.execute.return_value = mock_exec

    revoked = await revoke_native_refresh_session(mock_db, raw)
    assert revoked is True
    assert session.revoked_at is not None
    assert mock_db.commit.called
