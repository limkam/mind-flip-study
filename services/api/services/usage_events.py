"""Authoritative, append-only feature-allowance accounting."""

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from models.usage_event import UsageEvent, UsageReservation

BOOK_UPLOADED = "book_uploaded"
FLASHCARDS_GENERATED = "flashcards_generated"


def current_period_start(*, lifetime: bool, now: datetime | None = None) -> datetime | None:
    if lifetime:
        return None
    current = now or datetime.now(timezone.utc)
    return datetime(current.year, current.month, 1, tzinfo=timezone.utc)


async def consumed_quantity(
    db: AsyncSession,
    user_id: UUID,
    event_type: str,
    *,
    period_start: datetime | None,
    include_reservations: bool = True,
) -> int:
    filters = [UsageEvent.user_id == user_id, UsageEvent.event_type == event_type]
    if period_start is not None:
        filters.append(UsageEvent.created_at >= period_start)
    value = await db.scalar(select(func.coalesce(func.sum(UsageEvent.quantity), 0)).where(*filters))
    if not include_reservations:
        return int(value or 0)
    reservation_filters = [
        UsageReservation.user_id == user_id,
        UsageReservation.event_type == event_type,
    ]
    if period_start is not None:
        reservation_filters.append(UsageReservation.created_at >= period_start)
    reserved = await db.scalar(select(func.count(UsageReservation.id)).where(*reservation_filters))
    return int(value or 0) + int(reserved or 0)


async def record_usage(
    db: AsyncSession,
    *,
    user_id: UUID,
    event_type: str,
    resource_type: str,
    resource_id: UUID,
    period_start: datetime | None,
    idempotency_key: str,
    metadata: dict | None = None,
) -> UsageEvent:
    existing = await db.scalar(select(UsageEvent).where(UsageEvent.idempotency_key == idempotency_key))
    if existing is not None:
        return existing
    event = UsageEvent(
        user_id=user_id,
        event_type=event_type,
        resource_type=resource_type,
        resource_id=resource_id,
        quantity=1,
        billing_period_start=period_start,
        idempotency_key=idempotency_key,
        meta=metadata,
    )
    db.add(event)
    await db.flush()
    return event
