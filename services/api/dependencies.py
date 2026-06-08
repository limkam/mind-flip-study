from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from redis.asyncio import Redis
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from database import get_db
from jwt_tokens import TOKEN_TYPE_ACCESS, decode_token
from models.book import Book
from models.flashcard import Flashcard, FlashcardSet
from models.user import User

__all__ = [
    "get_db",
    "get_current_user",
    "get_redis",
    "oauth2_scheme",
    "require_role",
    "enforce_tier_limit",
    "enforce_auth_rate_limit",
]

oauth2_scheme = HTTPBearer(auto_error=True)


def get_redis(request: Request) -> Redis:
    return request.app.state.redis


def enforce_auth_rate_limit():
    """
    Redis INCR per client IP for credential-bearing ``/auth/*`` routes.

    Counts failed and successful attempts together to limit brute force across
    password login, registration, Google, and Apple.
    """

    async def _enforce_auth_rate_limit(
        request: Request,
        redis: Annotated[Redis, Depends(get_redis)],
    ) -> None:
        max_req = settings.AUTH_RATE_LIMIT_MAX_REQUESTS
        if max_req <= 0:
            return
        window = max(1, settings.AUTH_RATE_LIMIT_WINDOW_SEC)
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            client_ip = forwarded.split(",")[0].strip() or "unknown"
        else:
            client_ip = request.client.host if request.client else "unknown"
        key = f"auth:rl:{client_ip}"
        n = await redis.incr(key)
        if n == 1:
            await redis.expire(key, window)
        if n > max_req:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many requests. Try again later.",
            )

    return _enforce_auth_rate_limit


credentials_exception = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Could not validate credentials",
    headers={"WWW-Authenticate": "Bearer"},
)


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(oauth2_scheme)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    """Decode Bearer JWT `sub`, load User, or raise 401."""
    token = credentials.credentials
    try:
        payload = decode_token(token)
        subject = payload.get("sub")
        if subject is None or payload.get("type") != TOKEN_TYPE_ACCESS:
            raise credentials_exception
        user_uuid = UUID(str(subject))
    except (JWTError, ValueError):
        raise credentials_exception from None

    result = await db.execute(select(User).where(User.id == user_uuid))
    user = result.scalar_one_or_none()
    if user is None:
        raise credentials_exception
    if user.is_banned:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account suspended",
        )
    return user


def require_role(*roles: str):
    """Return a FastAPI dependency that raises 403 unless `current_user.role` is in `roles`."""

    async def _require_role(
        current_user: Annotated[User, Depends(get_current_user)],
    ) -> User:
        if current_user.role.value not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return current_user

    return _require_role


FREE_TIER_LIMITS = {"books": 3, "flashcard_sets": 3, "cards": 20}


def enforce_tier_limit(resource: str):
    """
    Dependency factory: 403 with upgrade payload if a free-tier user is at the limit
    for ``resource`` (``books`` | ``flashcard_sets`` | ``cards``).

    ``cards`` counts only flashcards in sets owned by the user (``FlashcardSet.user_id``).
    """

    if resource not in FREE_TIER_LIMITS:
        raise ValueError(f"Unknown resource for tier limit: {resource}")

    async def check(
        current_user: Annotated[User, Depends(get_current_user)],
        db: Annotated[AsyncSession, Depends(get_db)],
    ) -> None:
        if not settings.FREE_TIER_PAYWALL_ENABLED:
            return

        if current_user.subscription_tier != "free":
            return
        limit = FREE_TIER_LIMITS[resource]
        if resource == "cards":
            count = await db.scalar(
                select(func.count(Flashcard.id))
                .select_from(Flashcard)
                .join(FlashcardSet, Flashcard.set_id == FlashcardSet.id)
                .where(FlashcardSet.user_id == current_user.id),
            )
        elif resource == "books":
            count = await db.scalar(
                select(func.count(Book.id)).select_from(Book).where(Book.user_id == current_user.id),
            )
        else:
            count = await db.scalar(
                select(func.count(FlashcardSet.id))
                .select_from(FlashcardSet)
                .where(FlashcardSet.user_id == current_user.id),
            )
        n = int(count or 0)
        if n >= limit:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "UPGRADE_REQUIRED",
                    "message": f"Free plan limit reached ({limit} {resource}). Upgrade to Student plan.",
                    "limit": limit,
                    "upgrade_url": "/billing/checkout",
                },
            )

    return check
