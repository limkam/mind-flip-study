"""Capture authenticated users' IP addresses."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from jose import JWTError
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from database_sync import sync_session
from jwt_tokens import TOKEN_TYPE_ACCESS, decode_token
from models.user import User

MAX_IP_HISTORY = 20


def client_ip_from_request(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        ip = forwarded.split(",")[0].strip()
        if ip:
            return ip
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def _record_ip(user_id: UUID, ip: str) -> None:
    if not ip or ip == "unknown":
        return
    now = datetime.now(UTC).isoformat()
    with sync_session() as db:
        user = db.get(User, user_id)
        if user is None:
            return
        if user.last_ip == ip:
            return
        history = list(user.ip_history or [])
        history.append({"ip": ip, "timestamp": now})
        user.last_ip = ip
        user.ip_history = history[-MAX_IP_HISTORY:]
        db.commit()


class IPCaptureMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)

        auth = request.headers.get("authorization", "")
        if not auth.lower().startswith("bearer "):
            return response

        token = auth[7:].strip()
        try:
            payload = decode_token(token)
            if payload.get("type") != TOKEN_TYPE_ACCESS:
                return response
            user_id = UUID(str(payload.get("sub")))
        except (JWTError, ValueError, TypeError):
            return response

        try:
            _record_ip(user_id, client_ip_from_request(request))
        except Exception:
            # Never fail the request if IP logging fails
            pass

        return response
