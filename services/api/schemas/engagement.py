from datetime import datetime
from typing import Literal
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, ConfigDict, Field, field_validator


class NotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    type: str
    category: str
    title: str
    body: str
    action_label: str | None
    action_url: str | None
    icon: str | None
    read_at: datetime | None
    seen_at: datetime | None
    created_at: datetime


class NotificationPage(BaseModel):
    items: list[NotificationOut]
    page: int
    size: int
    total: int
    has_more: bool
    next_before_created_at: datetime | None = None
    next_before_id: UUID | None = None


class UnreadCount(BaseModel):
    count: int


class EngagementPreferencesOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    in_app_enabled: bool
    learning_reminders: bool
    streak_reminders: bool
    weekly_summaries: bool
    achievement_announcements: bool
    marketing_emails: bool
    celebration_animations: bool
    achievement_sounds: bool
    streak_sounds: bool
    quiet_hours_start: str | None
    quiet_hours_end: str | None
    timezone: str


class EngagementPreferencesPatch(BaseModel):
    in_app_enabled: bool | None = None
    learning_reminders: bool | None = None
    streak_reminders: bool | None = None
    weekly_summaries: bool | None = None
    achievement_announcements: bool | None = None
    marketing_emails: bool | None = None
    celebration_animations: bool | None = None
    achievement_sounds: bool | None = None
    streak_sounds: bool | None = None
    quiet_hours_start: str | None = Field(None, pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    quiet_hours_end: str | None = Field(None, pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    timezone: str | None = Field(None, min_length=1, max_length=64)

    @field_validator("timezone")
    @classmethod
    def valid_timezone(cls, value: str | None) -> str | None:
        if value is None:
            return None
        try:
            ZoneInfo(value)
        except ZoneInfoNotFoundError:
            raise ValueError("Unknown timezone") from None
        return value


class StreakOut(BaseModel):
    current_streak: int
    longest_streak: int
    last_qualifying_activity_at: datetime | None
    streak_timezone: str
    state: Literal["none", "active", "at_risk"]


class NudgeOut(BaseModel):
    id: UUID
    nudge_key: str
    placement: str
    category: str
    priority: int
    title: str
    body: str
    action_label: str
    action_url: str
    expires_at: datetime


class NudgeActionRequest(BaseModel):
    idempotency_key: str = Field(..., min_length=8, max_length=128, pattern=r"^[A-Za-z0-9._:-]+$")
