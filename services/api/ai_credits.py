"""Monthly AI generation credit tracking via StudyEvent."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from config import settings
from models.quiz import StudyEvent
from models.user import User

AI_GENERATION_EVENT = "ai_generation"


def monthly_credit_limit(user: User) -> int:
    if user.subscription_tier == "free":
        return settings.AI_CREDITS_FREE_MONTHLY
    return settings.AI_CREDITS_STUDENT_MONTHLY


def _month_start() -> datetime:
    now = datetime.now(UTC)
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


async def count_ai_generations_async(db: AsyncSession, user_id: UUID) -> int:
    since = _month_start()
    n = await db.scalar(
        select(func.count(StudyEvent.id)).where(
            StudyEvent.user_id == user_id,
            StudyEvent.event_type == AI_GENERATION_EVENT,
            StudyEvent.created_at >= since,
        ),
    )
    return int(n or 0)


def count_ai_generations_sync(db: Session, user_id: UUID) -> int:
    since = _month_start()
    n = db.scalar(
        select(func.count(StudyEvent.id)).where(
            StudyEvent.user_id == user_id,
            StudyEvent.event_type == AI_GENERATION_EVENT,
            StudyEvent.created_at >= since,
        ),
    )
    return int(n or 0)


async def ai_credits_snapshot(db: AsyncSession, user: User) -> dict[str, int]:
    limit = monthly_credit_limit(user)
    used = await count_ai_generations_async(db, user.id)
    return {
        "limit": limit,
        "used": used,
        "remaining": max(0, limit - used),
    }


def record_ai_generation_sync(db: Session, *, user_id: UUID, set_id: UUID | None = None) -> None:
    db.add(
        StudyEvent(
            user_id=user_id,
            set_id=set_id,
            event_type=AI_GENERATION_EVENT,
        ),
    )


async def assert_ai_credits_available(db: AsyncSession, user: User) -> None:
    snap = await ai_credits_snapshot(db, user)
    if snap["remaining"] <= 0:
        from fastapi import HTTPException, status

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "AI_CREDITS_EXHAUSTED",
                "message": "No AI credits remaining this month. Upgrade for more generations.",
                "limit": snap["limit"],
                "used": snap["used"],
                "upgrade_url": "/billing/checkout",
            },
        )
