"""Block API access until onboarding is completed."""

from __future__ import annotations

from uuid import UUID

from jose import JWTError
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from database_sync import sync_session
from jwt_tokens import TOKEN_TYPE_ACCESS, decode_token
from models.user import User

# Paths allowed without completed onboarding (authenticated or not).
_ONBOARDING_EXEMPT_PREFIXES = (
    "/auth",
    "/health",
    "/docs",
    "/redoc",
    "/openapi.json",
)
_ONBOARDING_EXEMPT_EXACT = frozenset({"/billing/webhook"})


def _is_onboarding_exempt(path: str) -> bool:
    if path in _ONBOARDING_EXEMPT_EXACT:
        return True
    return any(path == p or path.startswith(f"{p}/") for p in _ONBOARDING_EXEMPT_PREFIXES)


def _user_needs_onboarding(user_id: UUID) -> bool:
    with sync_session() as db:
        user = db.get(User, user_id)
        if user is None:
            return False
        return not user.onboarding_completed


class OnboardingGateMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.method == "OPTIONS":
            return await call_next(request)

        path = request.url.path.rstrip("/") or "/"
        if path == "/users/me" and request.method == "GET":
            return await call_next(request)
        if _is_onboarding_exempt(path):
            return await call_next(request)

        auth = request.headers.get("authorization", "")
        if not auth.lower().startswith("bearer "):
            return await call_next(request)

        token = auth[7:].strip()
        try:
            payload = decode_token(token)
            if payload.get("type") != TOKEN_TYPE_ACCESS:
                return await call_next(request)
            user_id = UUID(str(payload.get("sub")))
        except (JWTError, ValueError, TypeError):
            return await call_next(request)

        if _user_needs_onboarding(user_id):
            return JSONResponse(
                status_code=403,
                content={"error": "onboarding_required"},
            )

        return await call_next(request)
