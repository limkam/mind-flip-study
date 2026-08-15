from contextlib import asynccontextmanager
import logging
import re

import sentry_sdk
from fastapi import FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from redis.asyncio import Redis
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration

from config import settings
from database import init_engine
from middleware.ip_capture import IPCaptureMiddleware
from middleware.onboarding_gate import OnboardingGateMiddleware
from middleware.performance_timing import PerformanceTimingMiddleware
from s3_service import S3ConfigurationError, validate_s3_configuration
from routers.admin import router as admin_router
from routers.admin_owner_dashboard import router as admin_owner_dashboard_router
from routers.achievements import router as achievements_router
from routers.ai import router as ai_router
from routers.analytics import router as analytics_router
from routers.auth import router as auth_router
from routers.engagement import router as engagement_router
from routers.scorecards import public_router as public_scorecards_router, router as scorecards_router
from routers.credits import router as credits_router
from routers.feedback import router as feedback_router
from routers.billing import router as billing_router
from routers.books import router as books_router
from routers.card_progress import router as card_progress_router
from routers.flashcards import router as flashcards_router
from routers.folders import router as folders_router
from routers.jobs import router as jobs_router
from routers.challenge_leaderboard import router as challenge_leaderboard_router
from routers.leaderboard import router as leaderboard_router
from routers.quiz_challenges import router as quiz_challenges_router
from routers.quiz_results import router as quiz_results_router
from routers.study import router as study_router
from routers.study_groups import router as study_groups_router
from routers.users import router as users_router
from routers.email_webhooks import router as email_webhooks_router
from routers.email_preferences import router as email_preferences_router
from routers.activity import router as activity_router
from routers.admin_control import router as admin_control_router

if settings.SENTRY_DSN_API:
    sentry_sdk.init(
        dsn=settings.SENTRY_DSN_API,
        integrations=[FastApiIntegration(), SqlalchemyIntegration()],
        traces_sample_rate=0.1,
        environment=settings.ENVIRONMENT,
    )


logger = logging.getLogger(__name__)


class _PublicShareAccessLogFilter(logging.Filter):
    """Keep bearer share tokens out of Uvicorn's request-target access logs."""

    _share_path = re.compile(r"(/share/scorecard/)[A-Za-z0-9_-]{1,256}(/image)?")

    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.args, tuple) and len(record.args) >= 3:
            args = list(record.args)
            if isinstance(args[2], str):
                args[2] = self._share_path.sub(r"\1[redacted]\2", args[2])
                record.args = tuple(args)
        return True


logging.getLogger("uvicorn.access").addFilter(_PublicShareAccessLogFilter())


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings.validate_refresh_cookie_policy()
    settings.validate_email_policy()
    settings.validate_automation_policy()
    settings.validate_scorecard_share_policy()
    try:
        validate_s3_configuration()
    except S3ConfigurationError as exc:
        if settings.ENVIRONMENT == "production":
            raise
        logger.warning("S3 not fully configured (uploads will fail until fixed): %s", exc)
    init_engine(settings.DATABASE_URL)
    redis = Redis.from_url(settings.REDIS_URL, decode_responses=True)
    await redis.ping()
    app.state.redis = redis
    try:
        yield
    finally:
        await redis.aclose()


app = FastAPI(title="MindFlip API", lifespan=lifespan)

app.add_middleware(IPCaptureMiddleware)
app.add_middleware(OnboardingGateMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_origin_regex=settings.cors_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)
# Starlette wraps middleware in reverse registration order, so register this last
# to include the complete API middleware and endpoint duration.
app.add_middleware(PerformanceTimingMiddleware)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    detail = str(exc) if settings.ENVIRONMENT == "development" else "An unexpected error occurred"
    return JSONResponse(
        status_code=500,
        content={"error": "internal_server_error", "detail": detail},
    )


@app.get("/health", tags=["health"])
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/health/celery", tags=["health"])
async def health_celery() -> dict:
    from celery_health import inspect_celery_workers

    return inspect_celery_workers()


class SentryVerifyIn(BaseModel):
    secret: str = Field(..., min_length=1, max_length=256)


@app.post("/health/sentry-verify", tags=["health"])
async def sentry_verify(body: SentryVerifyIn) -> dict[str, bool]:
    """Send one test exception to Sentry (server SDK). Requires ``SENTRY_DSN_API`` and ``SENTRY_VERIFY_SECRET``."""
    if not settings.SENTRY_DSN_API:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Sentry is not configured",
        )
    if not settings.SENTRY_VERIFY_SECRET or body.secret != settings.SENTRY_VERIFY_SECRET:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid verify secret")
    sentry_sdk.capture_exception(RuntimeError("MindFlip Sentry connectivity verify (FastAPI)"))
    return {"ok": True}


app.include_router(auth_router, prefix="/auth")
app.include_router(email_webhooks_router, prefix="/email-provider")
app.include_router(email_preferences_router, prefix="/email")
app.include_router(engagement_router, prefix="/engagement")
app.include_router(scorecards_router, prefix="/scorecards")
app.include_router(public_scorecards_router)
app.include_router(admin_router, prefix="/admin")
app.include_router(admin_control_router, prefix="/admin/control")
app.include_router(admin_owner_dashboard_router, prefix="/admin/owner-dashboard")
app.include_router(analytics_router, prefix="/analytics")
app.include_router(activity_router, prefix="/activity")
app.include_router(billing_router, prefix="/billing")
app.include_router(credits_router)
app.include_router(users_router, prefix="/users")
app.include_router(books_router, prefix="/books")
app.include_router(flashcards_router, prefix="/flashcard-sets")
app.include_router(jobs_router, prefix="/jobs")
app.include_router(ai_router, prefix="/ai")
app.include_router(card_progress_router, prefix="/card-progress")
app.include_router(study_router, prefix="/study")
app.include_router(quiz_results_router, prefix="/quiz-results")
app.include_router(leaderboard_router, prefix="/leaderboard")
app.include_router(challenge_leaderboard_router, prefix="/challenge-leaderboard")
app.include_router(quiz_challenges_router, prefix="/quiz-challenges")
app.include_router(study_groups_router, prefix="/study-groups")
app.include_router(folders_router, prefix="/folders")
app.include_router(achievements_router, prefix="/achievements")
app.include_router(feedback_router) # already has /feedback prefix
