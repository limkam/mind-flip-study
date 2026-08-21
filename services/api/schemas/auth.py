from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from schemas.email import AppEmail
from schemas.user import UserPublic
from age_utils import validate_registration_date_of_birth


class AcquisitionSourceFields(BaseModel):
    """Optional UTM/referral capture, mixed into every account-creation request schema.
    Only applied when a *new* User row is created — ignored on login of an existing user."""

    model_config = ConfigDict(str_strip_whitespace=True)

    utm_source: str | None = Field(None, max_length=128)
    utm_medium: str | None = Field(None, max_length=128)
    utm_campaign: str | None = Field(None, max_length=128)
    referral_code: str | None = Field(None, max_length=64)


class RegisterRequest(AcquisitionSourceFields):
    model_config = ConfigDict(str_strip_whitespace=True)

    email: AppEmail
    password: str = Field(..., min_length=8)
    full_name: str = Field(..., min_length=1, max_length=255)
    # Date of birth is no longer collected at signup — it's collected (and age-validated)
    # at the in-app onboarding step instead. Kept optional here for compatibility.
    date_of_birth: date | None = None

    @field_validator("full_name", mode="before")
    @classmethod
    def strip_name(cls, v: object) -> object:
        if isinstance(v, str):
            return v.strip()
        return v

    @field_validator("date_of_birth")
    @classmethod
    def valid_date_of_birth(cls, value: date | None) -> date | None:
        return validate_registration_date_of_birth(value) if value is not None else None


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


class EmailAuthVerifyRequest(AcquisitionSourceFields):
    model_config = ConfigDict(str_strip_whitespace=True)

    challenge_id: str = Field(..., min_length=20, max_length=200)
    code: str = Field(..., pattern=r"^\d{6}$")
    remember_me: bool = True
    client: str | None = Field(None, max_length=32, description="'mobile' requests native refresh token response")
    date_of_birth: date | None = None

    @field_validator("date_of_birth")
    @classmethod
    def valid_signup_date_of_birth(cls, value: date | None) -> date | None:
        return validate_registration_date_of_birth(value) if value is not None else None


class ForgotPasswordBody(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    email: AppEmail


class ResetPasswordBody(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    token: str = Field(..., min_length=10, max_length=2048)
    password: str = Field(..., min_length=8)


class GoogleLoginRequest(AcquisitionSourceFields):
    model_config = ConfigDict(str_strip_whitespace=True)

    id_token: str = Field(..., min_length=10, max_length=12000)
    remember_me: bool = True
    client: str | None = Field(None, max_length=32, description="'mobile' requests native refresh token response")


class OnboardingRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    full_name: str | None = Field(None, max_length=255)
    date_of_birth: date
    gender: Literal["male", "female", "prefer_not_to_say"] | None = None
    country: str = Field(..., min_length=1, max_length=128)
    custom_country: str | None = Field(None, max_length=128)
    occupation: str = Field(..., min_length=1, max_length=100)
    job_title: str | None = Field(None, max_length=100)

    @field_validator("date_of_birth")
    @classmethod
    def valid_date_of_birth(cls, value: date) -> date:
        try:
            return validate_registration_date_of_birth(value)
        except ValueError as exc:
            raise ValueError(str(exc)) from exc

    @model_validator(mode="after")
    def require_custom_country_for_other(self):
        if self.country == "Other" and not self.custom_country:
            raise ValueError("Please enter your country")
        return self


class AppleLoginRequest(AcquisitionSourceFields):
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
