"""Low-overhead request and SQL timing without logging request data."""

from __future__ import annotations

from contextvars import ContextVar
from dataclasses import dataclass
import logging
import time
from uuid import uuid4

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import Response

logger = logging.getLogger("bilkeys.performance")


@dataclass
class RequestTiming:
    request_id: str
    sql_count: int = 0
    sql_ms: float = 0.0


current_timing: ContextVar[RequestTiming | None] = ContextVar("request_timing", default=None)

_IMPORTANT_PREFIXES = (
    "/users/me", "/auth/refresh", "/books", "/flashcard-sets",
    "/analytics", "/quiz-results", "/billing/entitlements",
    "/quiz-challenges", "/leaderboard", "/challenge-leaderboard",
    "/admin",
)


class PerformanceTimingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        timing = RequestTiming(request_id=uuid4().hex[:12])
        token = current_timing.set(timing)
        started = time.perf_counter()
        status_code = 500
        try:
            response = await call_next(request)
            status_code = response.status_code
            response.headers["X-Request-ID"] = timing.request_id
            response.headers["Server-Timing"] = f'db;dur={timing.sql_ms:.1f}, app;dur={(time.perf_counter() - started) * 1000:.1f}'
            return response
        finally:
            total_ms = (time.perf_counter() - started) * 1000
            # Log paths only. Query strings, headers, bodies, tokens, and user data are excluded.
            if request.url.path.startswith(_IMPORTANT_PREFIXES) or total_ms >= 500:
                logger.info(
                    "api_timing request_id=%s method=%s path=%s status=%s total_ms=%.1f sql_count=%s sql_ms=%.1f",
                    timing.request_id, request.method, request.url.path, status_code,
                    total_ms, timing.sql_count, timing.sql_ms,
                )
            current_timing.reset(token)


def record_sql(duration_ms: float) -> None:
    timing = current_timing.get()
    if timing is None:
        return
    timing.sql_count += 1
    timing.sql_ms += duration_ms
    if duration_ms >= 100:
        # Deliberately omit SQL text and bound parameters; either can contain private data.
        logger.warning(
            "slow_sql request_id=%s query_number=%s duration_ms=%.1f",
            timing.request_id, timing.sql_count, duration_ms,
        )
