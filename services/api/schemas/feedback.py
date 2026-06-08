from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from models.enums import FeedbackStatus


class FeedbackCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    content: str = Field(..., min_length=1, max_length=5000)
    category: str | None = Field(None, max_length=50)


class FeedbackPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    content: str
    category: str | None
    status: FeedbackStatus
    created_at: datetime
    updated_at: datetime


class FeedbackAdminUpdate(BaseModel):
    status: FeedbackStatus
