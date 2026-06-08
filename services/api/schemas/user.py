from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, computed_field

from age_utils import calculate_age
from models.enums import UserRole
from schemas.email import AppEmail


class UserSearchHit(BaseModel):
    """GET /users/search — name only (no id, no email)."""

    full_name: str


class UserPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: AppEmail
    role: UserRole
    full_name: str
    subscription_tier: str
    is_banned: bool = False
    preferences: dict = Field(default_factory=dict)
    date_of_birth: date | None = None
    country: str | None = None
    custom_country: str | None = None
    continent: str | None = None
    occupation: str | None = None
    job_title: str | None = None
    onboarding_completed: bool = False
    created_at: datetime
    updated_at: datetime

    @computed_field
    @property
    def age(self) -> int | None:
        if self.date_of_birth is None:
            return None
        return calculate_age(self.date_of_birth)


class UserSelfPatch(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    full_name: str | None = Field(None, min_length=1, max_length=255)
    preferences: dict | None = None
    date_of_birth: date | None = None
    occupation: str | None = Field(None, min_length=1, max_length=100)
    job_title: str | None = Field(None, min_length=1, max_length=100)


class AdminCreateUserRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    email: AppEmail
    password: str = Field(..., min_length=8)
    full_name: str = Field(..., min_length=1, max_length=255)
    role: UserRole = UserRole.student


class AdminPatchUserRole(BaseModel):
    role: UserRole
