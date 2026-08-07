from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

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
    remember_me: bool = True
    client: str | None = Field(None, max_length=32, description="'mobile' requests native refresh token response")


class LoginResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    user: UserPublic
    refresh_token: str | None = Field(None, description="Native refresh token (only returned when client='mobile')")


class RefreshTokenRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    refresh_token: str | None = Field(None, max_length=512)


class RefreshTokenResponse(BaseModel):
    """Bearer access token and optional rotated native refresh token on `/auth/refresh`."""

    access_token: str
    refresh_token: str | None = Field(None, description="Rotated native refresh token (only returned for native requests)")


class LogoutRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    refresh_token: str | None = Field(None, max_length=512)


class MessageResponse(BaseModel):
    message: str


class EmailAuthStartRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    email: AppEmail


class EmailAuthStartResponse(BaseModel):
    message: str
    challenge_id: str
    expires_in: int
    resend_after: int


class EmailAuthVerifyRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    challenge_id: str = Field(..., min_length=20, max_length=200)
    code: str = Field(..., pattern=r"^\d{6}$")
    remember_me: bool = True
    client: str | None = Field(None, max_length=32, description="'mobile' requests native refresh token response")


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
    remember_me: bool = True
    client: str | None = Field(None, max_length=32, description="'mobile' requests native refresh token response")


class OnboardingRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    full_name: str | None = Field(None, max_length=255)


class AppleLoginRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    identity_token: str = Field(..., min_length=10, max_length=12000)
    full_name: str | None = Field(None, max_length=255)
    remember_me: bool = True
    #: Raw nonce from the native Apple sign-in request (server checks SHA256 in the JWT).
    nonce: str | None = Field(None, max_length=512)
    client: str | None = Field(None, max_length=32, description="'mobile' requests native refresh token response")

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
