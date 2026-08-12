from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field
from models.enums import FeedbackStatus, SupportCategory


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


class SupportMessageCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    message: str = Field(..., min_length=1, max_length=5000)
    client_message_id: UUID
    category: SupportCategory | None = None


class SupportMessagePublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    conversation_id: UUID
    sender_type: Literal["user", "admin"]
    body: str
    category: SupportCategory | None = None
    client_message_id: UUID
    created_at: datetime
    read_at: datetime | None = None


class SupportConversationPublic(BaseModel):
    id: UUID | None = None
    status: Literal["open", "resolved"] = "open"
    unread_support_messages: int = 0
    messages: list[SupportMessagePublic] = []
    next_cursor: str | None = None


class AdminConversationRow(BaseModel):
    id: UUID
    user_id: UUID
    user_name: str
    user_email: str
    status: Literal["open", "resolved"]
    last_message_preview: str
    last_message_at: datetime
    admin_unread_count: int
    latest_user_category: SupportCategory | None = None


class AdminConversationPage(BaseModel):
    items: list[AdminConversationRow]
    total: int
    page: int
    size: int
    unread_conversations: int


class AdminConversationDetail(SupportConversationPublic):
    user_id: UUID
    user_name: str
    user_email: str
    admin_unread_count: int


class CategoryCount(BaseModel):
    category: SupportCategory
    count: int


class AdminSupportDashboard(BaseModel):
    open_conversations: int
    unread_conversations: int
    resolved_conversations: int
    new_conversations: int
    range: str
    categories: list[CategoryCount]
    recent_activity: list[AdminConversationRow]
