"""Owner Console — read-only metrics dashboards (Modules 1-9). No control/action
endpoints belong here; that's a separate, later phase per the build spec."""

from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import require_admin_role
from models.user import User
from schemas.owner_console import (
    AlertsOut,
    AttributionOut,
    CashOut,
    ComplianceOut,
    GovernanceOut,
    RetentionOut,
    RevenueOut,
    TechnicalOut,
    UnitEconomicsOut,
)
from services import owner_console_service

router = APIRouter(tags=["owner-console"])


@router.get("/revenue", response_model=RevenueOut)
async def revenue(
    _admin: Annotated[User, Depends(require_admin_role("owner"))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> RevenueOut:
    return await owner_console_service.revenue_metrics(db)


@router.get("/cash", response_model=CashOut)
async def cash(
    _admin: Annotated[User, Depends(require_admin_role("owner"))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CashOut:
    return await owner_console_service.cash_metrics(db)


@router.get("/unit-economics", response_model=UnitEconomicsOut)
async def unit_economics(
    _admin: Annotated[User, Depends(require_admin_role("owner"))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> UnitEconomicsOut:
    return await owner_console_service.unit_economics_metrics(db)


@router.get("/retention", response_model=RetentionOut)
async def retention(
    _admin: Annotated[User, Depends(require_admin_role("owner"))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> RetentionOut:
    return await owner_console_service.retention_metrics(db)


@router.get("/attribution", response_model=AttributionOut)
async def attribution(
    _admin: Annotated[User, Depends(require_admin_role("owner"))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AttributionOut:
    return await owner_console_service.attribution_metrics(db)


@router.get("/technical", response_model=TechnicalOut)
async def technical(
    _admin: Annotated[User, Depends(require_admin_role("owner"))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TechnicalOut:
    return await owner_console_service.technical_metrics(db)


@router.get("/compliance", response_model=ComplianceOut)
async def compliance(
    _admin: Annotated[User, Depends(require_admin_role("owner"))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ComplianceOut:
    return await owner_console_service.compliance_metrics(db)


@router.get("/alerts", response_model=AlertsOut)
async def alerts(
    _admin: Annotated[User, Depends(require_admin_role("owner"))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AlertsOut:
    return await owner_console_service.alerts_metrics(db)


@router.get("/governance", response_model=GovernanceOut)
async def governance(
    _admin: Annotated[User, Depends(require_admin_role("owner"))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> GovernanceOut:
    return await owner_console_service.governance_metrics(db)


@router.get("/governance/audit-log-export")
async def governance_audit_log_export(
    _admin: Annotated[User, Depends(require_admin_role("owner"))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    csv_content = await owner_console_service.export_audit_log_csv(db)
    return Response(
        csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=admin-audit-log.csv"},
    )
