"""Append-only writes for privileged administrator actions."""

from uuid import UUID

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from middleware.ip_capture import client_ip_from_request
from middleware.performance_timing import current_timing
from models.admin_observability import AdminAuditLog
from models.user import User


def record_admin_action(
    db: AsyncSession,
    *,
    admin: User,
    action: str,
    resource_type: str,
    resource_id: str | UUID | None = None,
    affected_user_id: UUID | None = None,
    previous: dict | None = None,
    new: dict | None = None,
    reason: str | None = None,
    metadata: dict | None = None,
    request: Request | None = None,
) -> AdminAuditLog:
    timing = current_timing.get()
    row = AdminAuditLog(
        admin_user_id=admin.id,
        admin_email=admin.email,
        action=action,
        target_resource_type=resource_type,
        target_resource_id=str(resource_id) if resource_id is not None else None,
        affected_user_id=affected_user_id,
        request_id=timing.request_id if timing else None,
        previous_value=previous,
        new_value=new,
        reason=reason.strip() if reason else None,
        metadata_=metadata,
        ip_address=client_ip_from_request(request) if request else None,
    )
    db.add(row)
    return row
