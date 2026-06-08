from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import get_current_user
from models.user import User
from models.feedback import Feedback
from schemas.feedback import FeedbackCreate, FeedbackPublic

router = APIRouter(prefix="/feedback", tags=["feedback"])


@router.post("", response_model=FeedbackPublic, status_code=status.HTTP_201_CREATED)
async def create_feedback(
    body: FeedbackCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FeedbackPublic:
    """Submit feedback from Web or Mobile."""
    feedback = Feedback(
        user_id=current_user.id,
        content=body.content,
        category=body.category,
    )
    db.add(feedback)
    await db.commit()
    await db.refresh(feedback)
    return FeedbackPublic.model_validate(feedback)
