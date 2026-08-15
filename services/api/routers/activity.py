"""Explicit meaningful activity and onboarding lifecycle events."""

from datetime import UTC, datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import get_current_user
from models.admin_observability import OnboardingEvent
from models.user import User
from services.activity_tracking import record_meaningful_activity

router = APIRouter(tags=["activity"])


class ActivityIn(BaseModel):
    activity_key: Literal["app_active", "navigation", "content_created", "study", "quiz", "flashcard_review", "support_message"]
    platform: Literal["web", "android", "ios"]


@router.post("/meaningful", status_code=202)
async def meaningful_activity(body: ActivityIn, current_user: Annotated[User, Depends(get_current_user)], db: Annotated[AsyncSession, Depends(get_db)]):
    recorded = await record_meaningful_activity(db, current_user, activity_key=body.activity_key, platform=body.platform)
    return {"recorded": recorded}


@router.post("/onboarding/start", status_code=202)
async def onboarding_start(current_user: Annotated[User, Depends(get_current_user)], db: Annotated[AsyncSession, Depends(get_db)]):
    now = datetime.now(UTC)
    if current_user.onboarding_started_at is None:
        current_user.onboarding_started_at = now
    await db.execute(insert(OnboardingEvent).values(user_id=current_user.id, event_type="started", step="").on_conflict_do_nothing(constraint="uq_onboarding_user_event_step"))
    await db.commit()
    return {"recorded": True}
