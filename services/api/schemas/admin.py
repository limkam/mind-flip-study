from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from age_utils import age_group_from_dob, calculate_age
from models.enums import BookStatus, UserRole
from models.user import User


class AdminUserUpdate(BaseModel):
    role: Literal["admin", "student"] | None = None
    is_banned: bool | None = None


class AdminUserRow(BaseModel):
    id: UUID
    full_name: str
    email: str
    role: UserRole
    created_at: datetime
    is_banned: bool
    date_of_birth: date | None = None
    age: int | None = None
    age_group: str | None = None
    country: str | None = None
    custom_country: str | None = None
    continent: str | None = None
    occupation: str | None = None
    job_title: str | None = None


def admin_user_row_from_model(user: User) -> AdminUserRow:
    age = calculate_age(user.date_of_birth) if user.date_of_birth else None
    return AdminUserRow(
        id=user.id,
        full_name=user.full_name,
        email=user.email,
        role=user.role,
        created_at=user.created_at,
        is_banned=user.is_banned,
        date_of_birth=user.date_of_birth,
        age=age,
        age_group=age_group_from_dob(user.date_of_birth) if user.date_of_birth else None,
        country=user.country,
        custom_country=user.custom_country,
        continent=user.continent,
        occupation=user.occupation,
        job_title=user.job_title,
    )


class AdminUserListPage(BaseModel):
    items: list[AdminUserRow]
    total: int
    page: int
    size: int


class AdminBookRow(BaseModel):
    id: UUID
    title: str
    author: str
    uploader_name: str
    uploader_email: str
    status: BookStatus
    created_at: datetime
    is_flagged: bool


class AdminBookListPage(BaseModel):
    items: list[AdminBookRow]
    total: int
    page: int
    size: int


class TopBookMetric(BaseModel):
    title: str
    set_count: int


class AdminUserIpRow(BaseModel):
    user_id: UUID
    username: str
    email: str
    last_ip: str | None = None
    last_seen: datetime | None = None
    ip_history: list[dict[str, Any]] = Field(default_factory=list)


class AdminUserIpListPage(BaseModel):
    items: list[AdminUserIpRow]


class AdminMetricsOut(BaseModel):
    dau: int
    signups_30d: int
    total_books: int
    ai_generations_30d: int
    paying_users: int
    mrr_usd: int
    top_books: list[TopBookMetric]
    ai_cost_30d_usd: float = 0.0


class AdminFeedbackRow(BaseModel):
    id: UUID
    user_id: UUID
    user_name: str
    user_email: str
    content: str
    category: str | None
    status: str
    created_at: datetime


class AdminFeedbackListPage(BaseModel):
    items: list[AdminFeedbackRow]
    total: int
    page: int
    size: int
