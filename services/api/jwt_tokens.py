"""JWT creation / validation for access vs refresh flows."""

from __future__ import annotations

import math
import time
import uuid
from typing import Any
from uuid import UUID

from jose import jwt

from config import settings

TOKEN_TYPE_ACCESS = "access"
TOKEN_TYPE_REFRESH = "refresh"
TOKEN_TYPE_PASSWORD_RESET = "password_reset"
BLOCKLIST_KEY_PREFIX = "blocklist:"
PASSWORD_RESET_KEY_PREFIX = "password_reset:"
PASSWORD_RESET_EXPIRE_SECONDS = 3600


def _utc_ts() -> int:
    # Integer epoch seconds compatible with JWT exp/iat NumericDate.
    return int(time.time())


def create_access_token(*, subject: UUID) -> str:
    expires_at = _utc_ts() + settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    payload = {
        "sub": str(subject),
        "type": TOKEN_TYPE_ACCESS,
        "iat": _utc_ts(),
        "exp": expires_at,
        "jti": str(uuid.uuid4()),
    }
    return jwt.encode(
        payload,
        settings.JWT_SECRET,
        algorithm=settings.JWT_ALGORITHM,
    )


def create_refresh_token(*, subject: UUID) -> str:
    expires_at = _utc_ts() + settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60
    payload = {
        "sub": str(subject),
        "type": TOKEN_TYPE_REFRESH,
        "iat": _utc_ts(),
        "exp": expires_at,
        "jti": str(uuid.uuid4()),
    }
    return jwt.encode(
        payload,
        settings.JWT_SECRET,
        algorithm=settings.JWT_ALGORITHM,
    )


def decode_token(token: str) -> dict[str, Any]:
    return jwt.decode(
        token,
        settings.JWT_SECRET,
        algorithms=[settings.JWT_ALGORITHM],
        options={"verify_aud": False},
    )


def ttl_seconds_remaining(exp_claim: Any) -> int:
    remaining = math.ceil(float(exp_claim) - time.time())
    return max(1, remaining)


def refresh_blocklist_key(jti: str) -> str:
    return f"{BLOCKLIST_KEY_PREFIX}{jti}"


def create_password_reset_token(*, subject: UUID) -> str:
    expires_at = _utc_ts() + PASSWORD_RESET_EXPIRE_SECONDS
    payload = {
        "sub": str(subject),
        "type": TOKEN_TYPE_PASSWORD_RESET,
        "iat": _utc_ts(),
        "exp": expires_at,
        "jti": str(uuid.uuid4()),
    }
    return jwt.encode(
        payload,
        settings.JWT_SECRET,
        algorithm=settings.JWT_ALGORITHM,
    )


def password_reset_redis_key(jti: str) -> str:
    return f"{PASSWORD_RESET_KEY_PREFIX}{jti}"
