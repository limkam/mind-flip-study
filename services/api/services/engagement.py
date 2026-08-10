"""Trusted, idempotent engagement event processing."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from typing import Any
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import select
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from models.engagement import (
    EngagementEvent,
    EngagementPreference,
    LearningStreak,
    Notification,
)
from services.achievement_sync import sync_user_achievements
from services.email_coordination import coordination_lock_key
from services.xp_service import process_streak_milestone_xp

QUALIFYING_EVENTS = {"assessment.completed", "study.review_completed"}
STREAK_MILESTONES = {3, 7, 30, 100}


@dataclass(frozen=True)
class EventInput:
    event_type: str
    source: str
    entity_type: str | None
    entity_id: str | None
    metadata: dict[str, Any]
    idempotency_key: str
    occurred_at: datetime


def safe_timezone(name: str) -> ZoneInfo:
    try:
        return ZoneInfo(name)
    except ZoneInfoNotFoundError:
        return ZoneInfo("UTC")


def next_streak_state(
    last_date: date | None, current: int, longest: int, activity_date: date
) -> tuple[int, int, str]:
    if last_date is not None and activity_date < last_date:
        return current, longest, "unchanged"
    if last_date == activity_date:
        return current, longest, "unchanged"
    if last_date == activity_date - timedelta(days=1):
        updated = current + 1
        return updated, max(longest, updated), "extended"
    return 1, max(longest, 1), "started"


async def get_or_create_preferences(
    db: AsyncSession, user_id: UUID
) -> EngagementPreference:
    row = await db.get(EngagementPreference, user_id)
    if row is None:
        row = EngagementPreference(user_id=user_id)
        db.add(row)
        await db.flush()
    return row


async def create_notification(
    db: AsyncSession,
    *,
    user_id: UUID,
    event_id: UUID | None,
    type_: str,
    category: str,
    title: str,
    body: str,
    idempotency_key: str,
    action_url: str | None = None,
    action_label: str | None = None,
    icon: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> Notification | None:
    if not settings.ENGAGEMENT_NOTIFICATIONS_ENABLED:
        return None
    prefs = await get_or_create_preferences(db, user_id)
    if not prefs.in_app_enabled:
        return None
    if category == "achievements" and not prefs.achievement_announcements:
        return None
    existing = await db.scalar(
        select(Notification).where(Notification.idempotency_key == idempotency_key)
    )
    if existing is not None:
        return existing
    row = Notification(
        user_id=user_id,
        event_id=event_id,
        type=type_,
        category=category,
        title=title,
        body=body,
        action_url=action_url,
        action_label=action_label,
        icon=icon,
        metadata_=metadata or {},
        idempotency_key=idempotency_key,
    )
    db.add(row)
    await db.flush()
    return row


async def _update_streak(
    db: AsyncSession, user_id: UUID, occurred_at: datetime, event: EngagementEvent
) -> tuple[str, int] | None:
    prefs = await get_or_create_preferences(db, user_id)
    local_date = occurred_at.astimezone(safe_timezone(prefs.timezone)).date()
    streak = await db.get(LearningStreak, user_id, with_for_update=True)
    if streak is None:
        streak = LearningStreak(user_id=user_id, streak_timezone=prefs.timezone)
        db.add(streak)
        await db.flush()
    previous_local_date = streak.last_qualifying_local_date
    if (
        streak.streak_timezone != prefs.timezone
        and streak.last_qualifying_activity_at is not None
    ):
        previous_local_date = streak.last_qualifying_activity_at.astimezone(
            safe_timezone(prefs.timezone)
        ).date()
    current, longest, change = next_streak_state(
        previous_local_date, streak.current_streak, streak.longest_streak, local_date
    )
    if change == "unchanged":
        return None
    streak.current_streak = current
    streak.longest_streak = longest
    streak.last_qualifying_activity_at = occurred_at
    streak.last_qualifying_local_date = local_date
    streak.streak_timezone = prefs.timezone
    if change == "started":
        streak.streak_started_at = occurred_at

    if current in STREAK_MILESTONES:
        await process_streak_milestone_xp(
            db,
            user_id=user_id,
            streak_days=current,
            local_date=str(local_date),
        )
        await create_notification(
            db,
            user_id=user_id,
            event_id=event.id,
            type_="streak.milestone_reached",
            category="streaks",
            title=f"{current}-day learning streak",
            body="Your consistent learning is paying off. Keep going at a pace that works for you.",
            action_url="/",
            action_label="View progress",
            icon="flame",
            idempotency_key=f"streak:{user_id}:{current}:{local_date}",
            metadata={"streak": current},
        )
    return change, current


async def emit_trusted_event(
    db: AsyncSession, *, user_id: UUID, event: EventInput
) -> tuple[EngagementEvent, bool]:
    existing = await db.scalar(
        select(EngagementEvent).where(
            EngagementEvent.idempotency_key == event.idempotency_key
        )
    )
    if existing is not None:
        return existing, False
    if (
        event.event_type.endswith(".completed")
        and event.entity_type
        and event.entity_id
    ):
        await db.execute(
            text("SELECT pg_advisory_xact_lock(:key)"),
            {"key": coordination_lock_key(user_id, event.entity_type, event.entity_id)},
        )
    # Imported here to keep the decision layer dependent on the trusted event
    # service without introducing a module import cycle.
    from services.engagement_rules import event_actions

    metadata = dict(event.metadata)
    row = EngagementEvent(
        user_id=user_id,
        event_type=event.event_type,
        source=event.source,
        entity_type=event.entity_type,
        entity_id=event.entity_id,
        metadata_=metadata,
        idempotency_key=event.idempotency_key,
        occurred_at=event.occurred_at.astimezone(UTC),
    )
    db.add(row)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        replay = await db.scalar(
            select(EngagementEvent).where(
                EngagementEvent.idempotency_key == event.idempotency_key
            )
        )
        if replay is None:
            raise
        return replay, False
    # Only the transaction that won the event idempotency race evaluates and
    # persists decisions. This avoids concurrent first-use preference inserts
    # competing before the trusted event's unique constraint is resolved.
    prefs = await get_or_create_preferences(db, user_id)
    row.metadata_ = {
        **metadata,
        "engagement_decisions": [
            action.value for action in event_actions(event.event_type, prefs)
        ],
    }
    if settings.ENGAGEMENT_STREAKS_ENABLED and event.event_type in QUALIFYING_EVENTS:
        streak_change = await _update_streak(db, user_id, row.occurred_at, row)
        if streak_change is not None:
            change, current = streak_change
            row.metadata_ = {**row.metadata_, "streak_change": change, "streak_days": current}
    await db.commit()

    awarded = (
        await sync_user_achievements(db, user_id)
        if settings.ENGAGEMENT_ACHIEVEMENTS_ENABLED
        else []
    )
    authorized_achievement_ids: list[str] = []
    for achievement in awarded:
        meta = dict(achievement.metadata_ or {})
        await create_notification(
            db,
            user_id=user_id,
            event_id=row.id,
            type_="achievement.unlocked",
            category="achievements",
            title=f"Achievement unlocked: {meta.get('title', 'New achievement')}",
            body=str(
                meta.get("description")
                or "You reached a meaningful learning milestone."
            ),
            action_url="/achievements",
            action_label="View achievement",
            icon=str(meta.get("icon") or "trophy"),
            idempotency_key=f"achievement:{achievement.id}",
            metadata={
                "achievement_id": str(achievement.id),
                "achievement_type": achievement.achievement_type,
                "celebration": "medium",
            },
        )
        achievement_actions = event_actions(
            "achievement.unlocked", prefs, achievement.earned_at
        )
        if any(action.value == "email" for action in achievement_actions):
            authorized_achievement_ids.append(str(achievement.id))
    if awarded:
        row.metadata_ = {
            **row.metadata_,
            "authorized_achievement_email_ids": authorized_achievement_ids,
        }
        await db.commit()
    # Celery performs durable email scheduling after the trusted transaction;
    # its task re-checks the Phase 1 decision persisted on the event.
    if "email" in row.metadata_.get("engagement_decisions", []):
        try:
            from tasks.email_tasks import schedule_engagement_email_task

            schedule_engagement_email_task.delay(str(row.id))
        except Exception:
            pass
    if (
        event.event_type.endswith(".completed")
        and event.entity_type
        and event.entity_id
    ):
        try:
            from tasks.email_tasks import cancel_completed_lifecycle_jobs

            cancel_completed_lifecycle_jobs.delay(
                str(user_id), event.entity_type, event.entity_id
            )
        except Exception:
            pass
    for achievement_id in authorized_achievement_ids:
        try:
            from tasks.email_tasks import schedule_achievement_email_task

            schedule_achievement_email_task.delay(str(row.id), achievement_id)
        except Exception:
            pass
    return row, True
