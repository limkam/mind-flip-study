"""Protected owner financial dashboard API."""

import logging
from typing import Annotated, Literal
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func, select
from database import get_db
from dependencies import require_role
from models.user import User
from models.billing_analytics import BillingEvent
from models.token_usage import TokenUsage
from repositories.owner_dashboard_repository import OwnerDashboardRepository
from schemas.owner_dashboard import (
    AlertsOut,
    CashPositionOut,
    DashboardPayload,
    SummaryOut,
    SystemHealthOut,
    UnitEconomicsOut,
    UserDetailOut,
)
from schemas.decision_intelligence import (
    DecisionPreferences,
    IntelligencePayload,
    ScenarioInput,
)
from services.decision_intelligence_service import (
    DecisionIntelligenceService,
    minimal_pdf,
)
from services.owner_dashboard_service import OwnerDashboardService

logger = logging.getLogger(__name__)
router = APIRouter(tags=["owner-dashboard"])


def service(db):
    return OwnerDashboardService(OwnerDashboardRepository(db))


def audit(request, user):
    logger.info("owner_dashboard_access user=%s endpoint=%s", user.id, request.url.path)


@router.get("/summary", response_model=SummaryOut)
async def summary(
    request: Request,
    user: Annotated[User, Depends(require_role("admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    audit(request, user)
    return await service(db).summary()


@router.get("/cash-position", response_model=CashPositionOut)
async def cash_position(
    request: Request,
    user: Annotated[User, Depends(require_role("admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    audit(request, user)
    return await service(db).cash_position()


@router.get("/unit-economics", response_model=UnitEconomicsOut)
async def unit_economics(
    request: Request,
    user: Annotated[User, Depends(require_role("admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    search: str | None = Query(None, max_length=100),
    status: str | None = None,
    segment: str | None = Query(None, max_length=32),
    sort: Literal[
        "user",
        "plan",
        "recognized_revenue",
        "ai_cost",
        "contribution_margin",
        "last_active",
    ] = "contribution_margin",
    direction: Literal["asc", "desc"] = "asc",
):
    audit(request, user)
    return await service(db).unit_economics(
        page=page,
        page_size=page_size,
        search=search,
        status=status,
        segment=segment,
        sort=sort,
        direction=direction,
    )


@router.get("/users/{user_id}", response_model=UserDetailOut)
async def user_detail(
    user_id: UUID,
    request: Request,
    user: Annotated[User, Depends(require_role("admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    audit(request, user)
    result = await service(db).user_detail(user_id)
    if not result:
        raise HTTPException(404, "User not found")
    return result


@router.get("/alerts", response_model=AlertsOut)
async def alerts(
    request: Request,
    user: Annotated[User, Depends(require_role("admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    audit(request, user)
    return await service(db).alerts()


@router.get("/system-health", response_model=SystemHealthOut)
async def system_health(
    request: Request,
    user: Annotated[User, Depends(require_role("admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    audit(request, user)
    svc = service(db)
    alert_data = await svc.alerts()
    fresh = alert_data["freshness"]
    redis_status = "healthy"
    try:
        await request.app.state.redis.ping()
    except Exception:
        redis_status = "critical"
    recent_webhook_failures = int(await db.scalar(select(func.count(BillingEvent.id)).where(BillingEvent.status == "failed")) or 0)
    recent_ai_failures = int(await db.scalar(select(func.count(TokenUsage.id)).where(TokenUsage.status == "failed")) or 0)
    stripe = "failing" if recent_webhook_failures else ("no_activity" if fresh.get("stripe_sync_time") is None else "healthy")
    ai = "degraded" if recent_ai_failures else ("no_activity" if fresh.get("ai_sync_time") is None else "healthy")
    return {
        "status": "degraded" if alert_data["items"] else "healthy",
        "stripe_sync": stripe,
        "ai_telemetry": ai,
        "database": "healthy",
        "alerts": len(alert_data["items"]),
        "indicators": [
            {
                "name": "Stripe Webhooks",
                "status": stripe,
                "detail": f"{recent_webhook_failures} failed durable webhook event(s)" if recent_webhook_failures else "No failed durable webhook events",
            },
            {
                "name": "Stripe Synchronization",
                "status": "unknown" if fresh.get("stripe_sync_time") is None else "healthy",
                "detail": "No recent activity is not treated as failure",
            },
            {"name": "Redis", "status": redis_status, "detail": "Live ping"},
            {
                "name": "Database",
                "status": "healthy",
                "detail": "Dashboard queries completed",
            },
            {
                "name": "AI Providers",
                "status": ai,
                "detail": f"{recent_ai_failures} failed AI call(s) recorded" if recent_ai_failures else "No failed AI calls recorded",
            },
            {
                "name": "Background Jobs",
                "status": "unknown",
                "detail": "No canonical job heartbeat table",
            },
            {
                "name": "Celery Beat",
                "status": "unknown",
                "detail": "No canonical scheduler heartbeat table",
            },
            {
                "name": "Worker Health",
                "status": "unknown",
                "detail": "No canonical worker heartbeat table",
            },
        ],
        "freshness": fresh,
    }


@router.get("/executive-summary", response_model=DashboardPayload)
async def executive_summary(
    request: Request,
    user: Annotated[User, Depends(require_role("admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    audit(request, user)
    return await service(db).executive_summary()


@router.get("/forecasts", response_model=DashboardPayload)
async def forecasts(
    request: Request,
    user: Annotated[User, Depends(require_role("admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    audit(request, user)
    return await service(db).forecasts()


@router.get("/ai-intelligence", response_model=DashboardPayload)
async def ai_intelligence(
    request: Request,
    user: Annotated[User, Depends(require_role("admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
    range: Literal["7d", "30d", "90d", "12m", "lifetime"] = "30d",
):
    audit(request, user)
    return await service(db).intelligence(range)


@router.get("/revenue-analytics", response_model=DashboardPayload)
async def revenue_analytics(
    request: Request,
    user: Annotated[User, Depends(require_role("admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
    range: Literal["7d", "30d", "90d", "12m", "lifetime"] = "30d",
):
    audit(request, user)
    return await service(db).revenue_analytics(range)


@router.get("/decision-center", response_model=IntelligencePayload)
async def decision_center(
    request: Request,
    user: Annotated[User, Depends(require_role("admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    audit(request, user)
    return await DecisionIntelligenceService(db).decision_center()


@router.get("/kpi-explanations", response_model=IntelligencePayload)
async def kpi_explanations(
    request: Request,
    user: Annotated[User, Depends(require_role("admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    audit(request, user)
    return await DecisionIntelligenceService(db).kpi_explanations()


@router.get("/timeline", response_model=IntelligencePayload)
async def timeline(
    request: Request,
    user: Annotated[User, Depends(require_role("admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
    period: Literal["today", "yesterday", "7d", "30d"] = "today",
):
    audit(request, user)
    return await DecisionIntelligenceService(db).timeline(period)


@router.get("/preferences", response_model=DecisionPreferences)
async def get_preferences(
    request: Request,
    user: Annotated[User, Depends(require_role("admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    audit(request, user)
    return DecisionIntelligenceService(db).preferences(user)


@router.put("/preferences", response_model=DecisionPreferences)
async def put_preferences(
    body: DecisionPreferences,
    request: Request,
    user: Annotated[User, Depends(require_role("admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    audit(request, user)
    logger.info(
        "owner_dashboard_preferences_changed user=%s watchlist=%s goals=%s",
        user.id,
        len(body.watchlist),
        len(body.goals),
    )
    return await DecisionIntelligenceService(db).save_preferences(user, body)


@router.get("/goals", response_model=IntelligencePayload)
async def goal_progress(
    request: Request,
    user: Annotated[User, Depends(require_role("admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    audit(request, user)
    return await DecisionIntelligenceService(db).goal_progress(user)


@router.post("/simulate", response_model=IntelligencePayload)
async def simulate(
    body: ScenarioInput,
    request: Request,
    user: Annotated[User, Depends(require_role("admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    audit(request, user)
    logger.info(
        "owner_dashboard_simulation user=%s inputs=%s", user.id, body.model_dump()
    )
    return await DecisionIntelligenceService(db).simulate(body)


@router.get("/reports/weekly")
async def weekly_report(
    request: Request,
    user: Annotated[User, Depends(require_role("admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
    format: Literal["markdown", "csv", "pdf"] = "markdown",
):
    audit(request, user)
    logger.info("owner_dashboard_export user=%s format=%s", user.id, format)
    markdown = await DecisionIntelligenceService(db).report_markdown()
    if format == "pdf":
        return Response(
            minimal_pdf(markdown),
            media_type="application/pdf",
            headers={
                "Content-Disposition": "attachment; filename=mindflip-weekly-report.pdf"
            },
        )
    if format == "csv":
        rows = [["section", "content"]] + [
            ["report", line] for line in markdown.splitlines() if line
        ]
        content = "\n".join(
            ",".join('"' + item.replace('"', '""') + '"' for item in row)
            for row in rows
        )
        return Response(
            content,
            media_type="text/csv",
            headers={
                "Content-Disposition": "attachment; filename=mindflip-weekly-report.csv"
            },
        )
    return Response(
        markdown,
        media_type="text/markdown",
        headers={
            "Content-Disposition": "attachment; filename=mindflip-weekly-report.md"
        },
    )
