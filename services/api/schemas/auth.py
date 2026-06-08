from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from age_utils import validate_date_of_birth
from schemas.email import AppEmail
from schemas.user import UserPublic


class RegisterRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    email: AppEmail
    password: str = Field(..., min_length=8)
    full_name: str = Field(..., min_length=1, max_length=255)

    @field_validator("full_name", mode="before")
    @classmethod
    def strip_name(cls, v: object) -> object:
        if isinstance(v, str):
            return v.strip()
        return v


class LoginRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    email: AppEmail
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    user: UserPublic


class RefreshTokenResponse(BaseModel):
    """Only the short-lived bearer token rotates on `/auth/refresh`."""

    access_token: str


class MessageResponse(BaseModel):
    message: str


class ForgotPasswordBody(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    email: AppEmail


class ResetPasswordBody(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    token: str = Field(..., min_length=10, max_length=2048)
    password: str = Field(..., min_length=8)


class GoogleLoginRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    id_token: str = Field(..., min_length=10, max_length=12000)


class OnboardingRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    date_of_birth: date = Field(..., description="ISO date YYYY-MM-DD; must not be in the future")

    @field_validator("date_of_birth")
    @classmethod
    def check_date_of_birth(cls, v: date) -> date:
        return validate_date_of_birth(v)

    country: str = Field(..., min_length=1, max_length=100)
    custom_country: str | None = Field(None, max_length=100)
    continent: str | None = Field(None, max_length=100)
    occupation: str = Field(..., min_length=1, max_length=100)


class AppleLoginRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    identity_token: str = Field(..., min_length=10, max_length=12000)
    full_name: str | None = Field(None, max_length=255)
    #: Raw nonce from the native Apple sign-in request (server checks SHA256 in the JWT).
    nonce: str | None = Field(None, max_length=512)

    @field_validator("nonce", mode="before")
    @classmethod
    def empty_nonce_to_none(cls, v: object) -> object:
        if v is None:
            return None
        if isinstance(v, str) and not v.strip():
            return None
        if isinstance(v, str):
            return v.strip()
        return v
