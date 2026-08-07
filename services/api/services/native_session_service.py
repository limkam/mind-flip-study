"""Service functions for issuing, rotating, and revoking native refresh sessions."""

from __future__ import annotations

import hashlib
import logging
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from models.native_session import NativeRefreshSession
from models.user import User

logger = logging.getLogger(__name__)

# Grace period (seconds) for concurrent duplicate network retries before triggering family theft revocation
CONCURRENT_RETRY_GRACE_SECONDS = 10.0


def hash_native_refresh_token(raw_token: str) -> str:
    """Computes SHA-256 hash of a raw native refresh token."""
    return hashlib.sha256(raw_token.strip().encode("utf-8")).hexdigest()


def generate_raw_native_refresh_token() -> str:
    """Generates a high-entropy cryptographically secure opaque token."""
    return f"nrt_{secrets.token_urlsafe(48)}"


def _calculate_expiry(*, remember_me: bool = True) -> datetime:
    seconds = (
        settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400
        if remember_me
        else settings.SESSION_REFRESH_EXPIRE_HOURS * 3600
    )
    return datetime.now(timezone.utc) + timedelta(seconds=seconds)


async def create_native_refresh_session(
    db: AsyncSession,
    user_id: uuid.UUID,
    *,
    client_platform: str | None = "mobile",
    remember_me: bool = True,
) -> tuple[NativeRefreshSession, str]:
    """Issues a new native refresh session and returns (session_model, raw_token)."""
    raw_token = generate_raw_native_refresh_token()
    token_hash = hash_native_refresh_token(raw_token)
    expires_at = _calculate_expiry(remember_me=remember_me)

    session = NativeRefreshSession(
        id=uuid.uuid4(),
        user_id=user_id,
        token_hash=token_hash,
        family_id=uuid.uuid4(),
        client_platform=client_platform[:32] if client_platform else "mobile",
        expires_at=expires_at,
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return session, raw_token


async def rotate_native_refresh_session(
    db: AsyncSession,
    raw_token: str,
) -> tuple[uuid.UUID, str]:
    """Rotates a native refresh token atomically using row locking. Returns (user_id, new_raw_token).

    Enforces single-use rotation and family revocation on theft detection.
    """
    if not raw_token or typeof_token_invalid(raw_token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )

    token_hash = hash_native_refresh_token(raw_token)
    # Use with_for_update() to serialize concurrent rotation attempts on the same token
    result = await db.execute(
        select(NativeRefreshSession)
        .where(NativeRefreshSession.token_hash == token_hash)
        .with_for_update(nowait=False)
    )
    session = result.scalar_one_or_none()

    if session is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )

    now = datetime.now(timezone.utc)

    # Theft / Token Reuse Detection
    if session.revoked_at is not None or session.replaced_by_id is not None:
        revoked_at = session.revoked_at or now
        time_since_revocation = (now - revoked_at).total_seconds()

        # If token was revoked recently (<= CONCURRENT_RETRY_GRACE_SECONDS), treat as benign transport race
        if time_since_revocation <= CONCURRENT_RETRY_GRACE_SECONDS:
            logger.info(
                "Concurrent refresh race detected for user_id=%s family_id=%s (age=%.2fs)",
                session.user_id,
                session.family_id,
                time_since_revocation,
            )
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token already rotated",
            )

        # Stale token replay (> grace period) -> Revoke entire session family on theft detection
        logger.warning(
            "Native refresh token theft/replay detected for user_id=%s family_id=%s (age=%.2fs)",
            session.user_id,
            session.family_id,
            time_since_revocation,
        )
        family_result = await db.execute(
            select(NativeRefreshSession).where(
                NativeRefreshSession.family_id == session.family_id,
                NativeRefreshSession.revoked_at.is_(None),
            )
        )
        family_sessions = family_result.scalars().all()
        for s in family_sessions:
            s.revoked_at = now
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or revoked refresh token",
        )

    # Expiry Check
    if session.expires_at <= now:
        session.revoked_at = now
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or revoked refresh token",
        )

    # User Status Check
    user = await db.get(User, session.user_id)
    if user is None or user.is_banned:
        session.revoked_at = now
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account suspended or invalid user",
        )

    # Rotate Credential
    new_raw_token = generate_raw_native_refresh_token()
    new_token_hash = hash_native_refresh_token(new_raw_token)
    new_expiry = _calculate_expiry(remember_me=True)

    new_session = NativeRefreshSession(
        id=uuid.uuid4(),
        user_id=session.user_id,
        token_hash=new_token_hash,
        family_id=session.family_id,
        client_platform=session.client_platform,
        expires_at=new_expiry,
    )
    db.add(new_session)
    await db.flush()

    session.revoked_at = now
    session.replaced_by_id = new_session.id
    session.last_used_at = now

    await db.commit()
    return session.user_id, new_raw_token


async def revoke_native_refresh_session(
    db: AsyncSession,
    raw_token: str,
) -> bool:
    """Revokes a native refresh token session (e.g. on logout)."""
    if not raw_token or typeof_token_invalid(raw_token):
        return False

    token_hash = hash_native_refresh_token(raw_token)
    result = await db.execute(
        select(NativeRefreshSession).where(NativeRefreshSession.token_hash == token_hash)
    )
    session = result.scalar_one_or_none()

    if session is None or session.revoked_at is not None:
        return False

    session.revoked_at = datetime.now(timezone.utc)
    await db.commit()
    return True


def typeof_token_invalid(token: str) -> bool:
    if not isinstance(token, str):
        return True
    cleaned = token.strip()
    return len(cleaned) < 20 or len(cleaned) > 256
