"""Throttled, meaningful authenticated platform activity tracking."""

from datetime import UTC, datetime

from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from models.admin_observability import UserActivityEvent
from models.user import User

ALLOWED_ACTIVITY_KEYS = {
    "app_active", "navigation", "content_created", "study", "quiz",
    "flashcard_review", "support_message",
}
ALLOWED_PLATFORMS = {"web", "android", "ios"}


async def record_meaningful_activity(
    db: AsyncSession,
    user: User,
    *,
    activity_key: str,
    platform: str,
) -> bool:
    if activity_key not in ALLOWED_ACTIVITY_KEYS or platform not in ALLOWED_PLATFORMS:
        raise ValueError("Unsupported activity key or platform")
    now = datetime.now(UTC)
    bucket = now.replace(minute=(now.minute // 15) * 15, second=0, microsecond=0)
    stmt = (
        insert(UserActivityEvent)
        .values(user_id=user.id, activity_key=activity_key, platform=platform, bucket_started_at=bucket, occurred_at=now)
        .on_conflict_do_nothing(constraint="uq_user_activity_throttle")
        .returning(UserActivityEvent.id)
    )
    created = await db.scalar(stmt)
    if created is not None and (user.last_active_at is None or (now - user.last_active_at).total_seconds() >= 900):
        user.last_active_at = now
        db.add(user)
    await db.commit()
    return created is not None
