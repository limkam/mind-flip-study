from datetime import UTC, datetime, timedelta
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from config import settings
from dependencies import get_current_user
from models.engagement import LearningStreak, Notification, NudgeState
from models.user import User
from schemas.engagement import EngagementPreferencesOut, EngagementPreferencesPatch, NotificationOut, NotificationPage, NudgeActionRequest, NudgeOut, StreakOut, UnreadCount
from services.engagement import get_or_create_preferences, safe_timezone
from services.engagement_rules import select_nudge

router = APIRouter(tags=["engagement"])


@router.get("/nudges/current", response_model=NudgeOut | None)
async def current_nudge(current_user: Annotated[User, Depends(get_current_user)], db: Annotated[AsyncSession, Depends(get_db)], placement: Literal["dashboard", "learning"] = Query(...)) -> NudgeOut | None:
    selected = await select_nudge(db, current_user, placement)
    if selected is None:
        return None
    candidate, state = selected
    await db.commit()
    await db.refresh(state)
    return NudgeOut(id=state.id, nudge_key=candidate.key, placement=candidate.placement, category=candidate.category, priority=candidate.priority, title=candidate.title, body=candidate.body, action_label=candidate.action_label, action_url=candidate.action_url, expires_at=candidate.expires_at)


async def _owned_nudge(db: AsyncSession, user_id: UUID, nudge_id: UUID, *, lock: bool = False) -> NudgeState:
    statement = select(NudgeState).where(NudgeState.id == nudge_id, NudgeState.user_id == user_id)
    if lock:
        statement = statement.with_for_update()
    row = await db.scalar(statement)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nudge not found")
    return row


async def _record_nudge_action(db: AsyncSession, user_id: UUID, nudge_id: UUID, action: str, key: str) -> None:
    row = await _owned_nudge(db, user_id, nudge_id, lock=True)
    context = dict(row.context or {})
    action_keys = list(context.get("action_keys") or [])
    scoped_key = f"{action}:{key}"
    if scoped_key in action_keys:
        return
    now = datetime.now(UTC)
    action_keys.append(scoped_key)
    context["action_keys"] = action_keys[-50:]
    row.context = context
    if action == "impression":
        row.impression_count += 1
        row.last_shown_at = now
        row.cooldown_until = now + timedelta(hours=4)
    elif action == "click":
        row.last_clicked_at = now
    elif action == "dismissal":
        row.dismissed_at = now
        row.cooldown_until = now + timedelta(days=7)
    elif action == "conversion":
        row.converted_at = now
    await db.commit()


@router.post("/nudges/{nudge_id}/impression", status_code=status.HTTP_204_NO_CONTENT)
async def record_nudge_impression(nudge_id: UUID, body: NudgeActionRequest, current_user: Annotated[User, Depends(get_current_user)], db: Annotated[AsyncSession, Depends(get_db)]) -> None:
    await _record_nudge_action(db, current_user.id, nudge_id, "impression", body.idempotency_key)


@router.post("/nudges/{nudge_id}/click", status_code=status.HTTP_204_NO_CONTENT)
async def record_nudge_click(nudge_id: UUID, body: NudgeActionRequest, current_user: Annotated[User, Depends(get_current_user)], db: Annotated[AsyncSession, Depends(get_db)]) -> None:
    await _record_nudge_action(db, current_user.id, nudge_id, "click", body.idempotency_key)


@router.post("/nudges/{nudge_id}/dismissal", status_code=status.HTTP_204_NO_CONTENT)
async def record_nudge_dismissal(nudge_id: UUID, body: NudgeActionRequest, current_user: Annotated[User, Depends(get_current_user)], db: Annotated[AsyncSession, Depends(get_db)]) -> None:
    await _record_nudge_action(db, current_user.id, nudge_id, "dismissal", body.idempotency_key)


@router.post("/nudges/{nudge_id}/conversion", status_code=status.HTTP_204_NO_CONTENT)
async def record_nudge_conversion(nudge_id: UUID, body: NudgeActionRequest, current_user: Annotated[User, Depends(get_current_user)], db: Annotated[AsyncSession, Depends(get_db)]) -> None:
    await _record_nudge_action(db, current_user.id, nudge_id, "conversion", body.idempotency_key)


def _require_notifications() -> None:
    if not settings.ENGAGEMENT_NOTIFICATIONS_ENABLED:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notifications are not enabled")


def _active_notification_filter(user_id: UUID):
    now = datetime.now(UTC)
    return (Notification.user_id == user_id, Notification.dismissed_at.is_(None), or_(Notification.expires_at.is_(None), Notification.expires_at > now))


@router.get("/notifications", response_model=NotificationPage)
async def list_notifications(current_user: Annotated[User, Depends(get_current_user)], db: Annotated[AsyncSession, Depends(get_db)], page: int = Query(1, ge=1), size: int = Query(20, ge=1, le=50), category: str | None = Query(None, max_length=40), before_created_at: datetime | None = None, before_id: UUID | None = None) -> NotificationPage:
    _require_notifications()
    filters = list(_active_notification_filter(current_user.id))
    if category:
        filters.append(Notification.category == category)
    total = int(await db.scalar(select(func.count()).select_from(Notification).where(*filters)) or 0)
    if before_created_at is not None and before_id is not None:
        filters.append(or_(Notification.created_at < before_created_at, and_(Notification.created_at == before_created_at, Notification.id < before_id)))
    rows = list((await db.scalars(select(Notification).where(*filters).order_by(Notification.created_at.desc(), Notification.id.desc()).limit(size + 1))).all())
    has_more = len(rows) > size
    rows = rows[:size]
    last = rows[-1] if has_more and rows else None
    return NotificationPage(items=[NotificationOut.model_validate(row) for row in rows], page=page, size=size, total=total, has_more=has_more, next_before_created_at=last.created_at if last else None, next_before_id=last.id if last else None)


@router.get("/notifications/unread-count", response_model=UnreadCount)
async def unread_count(current_user: Annotated[User, Depends(get_current_user)], db: Annotated[AsyncSession, Depends(get_db)]) -> UnreadCount:
    _require_notifications()
    count = int(await db.scalar(select(func.count()).select_from(Notification).where(*_active_notification_filter(current_user.id), Notification.read_at.is_(None))) or 0)
    return UnreadCount(count=count)


@router.patch("/notifications/{notification_id}/read", response_model=NotificationOut)
async def mark_notification_read(notification_id: UUID, current_user: Annotated[User, Depends(get_current_user)], db: Annotated[AsyncSession, Depends(get_db)]) -> NotificationOut:
    _require_notifications()
    row = await db.scalar(select(Notification).where(Notification.id == notification_id, Notification.user_id == current_user.id))
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
    now = datetime.now(UTC)
    row.read_at = row.read_at or now
    row.seen_at = row.seen_at or now
    await db.commit()
    await db.refresh(row)
    return NotificationOut.model_validate(row)


@router.post("/notifications/read-all", response_model=UnreadCount)
async def mark_all_read(current_user: Annotated[User, Depends(get_current_user)], db: Annotated[AsyncSession, Depends(get_db)]) -> UnreadCount:
    _require_notifications()
    rows = (await db.scalars(select(Notification).where(*_active_notification_filter(current_user.id), Notification.read_at.is_(None)))).all()
    now = datetime.now(UTC)
    for row in rows:
        row.read_at = now
        row.seen_at = row.seen_at or now
    await db.commit()
    return UnreadCount(count=0)


@router.delete("/notifications/{notification_id}", status_code=status.HTTP_204_NO_CONTENT)
async def dismiss_notification(notification_id: UUID, current_user: Annotated[User, Depends(get_current_user)], db: Annotated[AsyncSession, Depends(get_db)]) -> None:
    _require_notifications()
    row = await db.scalar(select(Notification).where(Notification.id == notification_id, Notification.user_id == current_user.id))
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
    row.dismissed_at = datetime.now(UTC)
    await db.commit()


@router.get("/preferences", response_model=EngagementPreferencesOut)
async def get_preferences(current_user: Annotated[User, Depends(get_current_user)], db: Annotated[AsyncSession, Depends(get_db)]) -> EngagementPreferencesOut:
    row = await get_or_create_preferences(db, current_user.id)
    await db.commit()
    return EngagementPreferencesOut.model_validate(row)


@router.patch("/preferences", response_model=EngagementPreferencesOut)
async def patch_preferences(body: EngagementPreferencesPatch, current_user: Annotated[User, Depends(get_current_user)], db: Annotated[AsyncSession, Depends(get_db)]) -> EngagementPreferencesOut:
    row = await get_or_create_preferences(db, current_user.id)
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(row, key, value)
    await db.commit()
    await db.refresh(row)
    return EngagementPreferencesOut.model_validate(row)


@router.get("/streak", response_model=StreakOut)
async def get_streak(current_user: Annotated[User, Depends(get_current_user)], db: Annotated[AsyncSession, Depends(get_db)]) -> StreakOut:
    if not settings.ENGAGEMENT_STREAKS_ENABLED:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Streaks are not enabled")
    row = await db.get(LearningStreak, current_user.id)
    if row is None:
        return StreakOut(current_streak=0, longest_streak=0, last_qualifying_activity_at=None, streak_timezone="UTC", state="none")
    local_today = datetime.now(UTC).astimezone(safe_timezone(row.streak_timezone)).date()
    days = (local_today - row.last_qualifying_local_date).days if row.last_qualifying_local_date else 999
    state = "active" if days == 0 else "at_risk" if days == 1 and row.current_streak > 0 else "none"
    return StreakOut(current_streak=row.current_streak if days <= 1 else 0, longest_streak=row.longest_streak, last_qualifying_activity_at=row.last_qualifying_activity_at, streak_timezone=row.streak_timezone, state=state)
