from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import get_current_user
from models.achievement import Achievement
from models.user import User

router = APIRouter(tags=["achievements"])


class AchievementCreate(BaseModel):
    achievement_type: str = Field(..., min_length=1, max_length=128)
    metadata: dict[str, Any] = Field(default_factory=dict)


class AchievementOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    achievement_type: str
    earned_at: datetime
    metadata: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="before")
    @classmethod
    def _map_meta(cls, data: Any) -> Any:
        if isinstance(data, Achievement):
            return {
                "id": data.id,
                "user_id": data.user_id,
                "achievement_type": data.achievement_type,
                "earned_at": data.earned_at,
                "metadata": dict(data.metadata_ or {}),
            }
        return data


@router.get("/", response_model=list[AchievementOut])
async def list_achievements(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[AchievementOut]:
    r = await db.execute(
        select(Achievement).where(Achievement.user_id == current_user.id).order_by(Achievement.earned_at.desc()),
    )
    rows = r.scalars().all()
    return [AchievementOut.model_validate(a) for a in rows]


@router.post("/", response_model=AchievementOut, status_code=status.HTTP_201_CREATED)
async def create_achievement(
    body: AchievementCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AchievementOut:
    row = Achievement(
        user_id=current_user.id,
        achievement_type=body.achievement_type,
        metadata_=body.metadata,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return AchievementOut.model_validate(row)
