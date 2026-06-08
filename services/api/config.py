from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

_API_DIR = Path(__file__).resolve().parent
_REPO_ROOT = _API_DIR.parent.parent
_ENV_FILES = tuple(
    str(p)
    for p in (_REPO_ROOT / ".env", _API_DIR / ".env")
    if p.is_file()
)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=_ENV_FILES or ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    DATABASE_URL: str = "postgresql://mindflip:mindflip@localhost:5432/mindflip"
    
    REDIS_URL: str = "redis://redis:6379/0"
    JWT_SECRET: str = "changeme-use-long-random-secret"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    #: Use ``True`` in production behind HTTPS so browsers accept the cookie.
    REFRESH_TOKEN_COOKIE_SECURE: bool = False
    #: Refresh cookie scoped to ``/auth/*`` so it is not sent to resource routes.
    REFRESH_TOKEN_COOKIE_PATH: str = "/auth"
    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""
    S3_BUCKET_NAME: str = "mindflip-books"
    S3_REGION: str = "us-east-1"
    ANTHROPIC_API_KEY: str = ""
    #: Secrets Manager secret id when ``ENVIRONMENT=production``.
    ANTHROPIC_SECRET_ID: str = "mindflip/anthropic-api-key"
    AWS_SECRETS_REGION: str = "us-east-1"

    # Comma-separated list, e.g. web + admin dashboards
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:5174,https://admin.mindflip.io"

    GOOGLE_CLIENT_ID: str = ""
    APPLE_BUNDLE_ID: str = ""

    STRIPE_SECRET_KEY: str = ""
    #: Legacy single-price fallback; prefer STRIPE_PRICE_ID_BASIC / _PREMIUM.
    STRIPE_PRICE_ID: str = ""
    STRIPE_PRICE_ID_BASIC: str = ""
    STRIPE_PRICE_ID_PREMIUM: str = ""
    STRIPE_WEBHOOK_SECRET: str = ""
    FRONTEND_URL: str = "http://localhost:5173"

    #: Transactional email (https://resend.com). Leave empty to skip sends in dev.
    RESEND_API_KEY: str = ""
    FROM_EMAIL: str = "MindFlip <hello@mindflip.io>"

    #: Server error reporting (https://sentry.io). Leave empty to disable.
    SENTRY_DSN_API: str = ""
    #: Shared secret for ``POST /health/sentry-verify`` (manual connectivity test). Leave empty to disable that route.
    SENTRY_VERIFY_SECRET: str = ""
    #: e.g. development, staging, production — forwarded to Sentry.
    ENVIRONMENT: str = "development"

    #: Sliding window (seconds) for Redis auth rate limit (login, register, Google, Apple).
    AUTH_RATE_LIMIT_WINDOW_SEC: int = 60
    #: Max credential-bearing auth attempts per client IP per window (0 = disable).
    AUTH_RATE_LIMIT_MAX_REQUESTS: int = 40

    #: When ``True``, free-tier users hit limits (3 books, 3 sets, 20 cards) and receive
    #: ``UPGRADE_REQUIRED``. Set ``False`` during development/testing.
    FREE_TIER_PAYWALL_ENABLED: bool = False

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]


settings = Settings()


def get_settings() -> Settings:
    return settings
