from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Matches production and preview Vercel deploys, e.g.
# https://mind-flip-study.vercel.app
# https://mind-flip-study-git-main-user.vercel.app
_VERCEL_PREVIEW_ORIGIN_RE = r"https://[a-zA-Z0-9-]+\.vercel\.app"

_API_DIR = Path(__file__).resolve().parent
_REPO_ROOT = _API_DIR.parent.parent
_ENV_FILES = tuple(
    str(p) for p in (_REPO_ROOT / ".env", _API_DIR / ".env") if p.is_file()
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
    #: Session-only refresh cookie lifetime when "Keep me signed in" is unchecked (hours).
    SESSION_REFRESH_EXPIRE_HOURS: int = 12

    #: Use ``True`` in production behind HTTPS so browsers accept the cookie.
    REFRESH_TOKEN_COOKIE_SECURE: bool = False
    #: Refresh cookie scoped to ``/auth/*`` so it is not sent to resource routes.
    REFRESH_TOKEN_COOKIE_PATH: str = "/auth"
    #: ``strict`` | ``lax`` | ``none``. Leave empty to auto-pick (``none`` when Vercel
    #: preview CORS is enabled, otherwise ``strict`` for same-site custom domains).
    REFRESH_TOKEN_COOKIE_SAMESITE: str = ""
    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""
    S3_BUCKET_NAME: str = "mindflip-books"
    S3_REGION: str = "us-east-1"
    ANTHROPIC_API_KEY: str = ""
    #: Secrets Manager secret id when ``ENVIRONMENT=production``.
    ANTHROPIC_SECRET_ID: str = "mindflip/anthropic-api-key"
    AWS_SECRETS_REGION: str = "us-east-1"

    # Comma-separated list, e.g. web + admin dashboards
    CORS_ORIGINS: str = (
        "http://localhost:5173,http://localhost:5174,https://admin.mindflip.io"
    )
    #: Allow any ``https://<subdomain>.vercel.app`` origin (preview + production deploys).
    CORS_ALLOW_VERCEL_PREVIEWS: bool = False
    #: Extra CORS origin regexes (comma-separated). Combined with ``CORS_ALLOW_VERCEL_PREVIEWS``.
    CORS_ORIGIN_REGEX: str = ""

    GOOGLE_CLIENT_ID: str = ""
    APPLE_BUNDLE_ID: str = ""

    AI_CREDITS_FREE_MONTHLY: int = 30
    AI_CREDITS_STUDENT_MONTHLY: int = 500

    STRIPE_SECRET_KEY: str = ""
    #: Legacy single-price fallback; prefer STRIPE_PRICE_ID_BASIC / _PREMIUM.
    STRIPE_PRICE_ID: str = ""
    STRIPE_PRICE_ID_BASIC: str = ""
    STRIPE_PRICE_ID_PREMIUM: str = ""
    STRIPE_PRICE_ID_STANDARD_MONTHLY: str = ""
    STRIPE_PRICE_ID_STANDARD_ANNUAL: str = ""
    STRIPE_PRICE_ID_QUICK_MONTHLY: str = ""
    STRIPE_PRICE_ID_QUICK_ANNUAL: str = ""
    # Legacy environment variable names retained while deployments move to the
    # canonical QUICK_MONTHLY / QUICK_ANNUAL names above.
    STRIPE_PRICE_ID_QUICK7_MONTHLY: str = ""
    STRIPE_PRICE_ID_QUICK7_YEARLY: str = ""
    STRIPE_PRICE_ID_PREMIUM_MONTHLY: str = ""
    STRIPE_PRICE_ID_PREMIUM_ANNUAL: str = ""
    #: Optional Stripe unit-price id for quantity-based credit purchases.
    STRIPE_PRICE_ID_CREDIT_UNIT: str = ""
    #: Fallback when ``STRIPE_PRICE_ID_CREDIT_UNIT`` is not set.
    CREDIT_UNIT_PRICE_CENTS: int = 80
    CREDIT_CURRENCY: str = "usd"
    BILLING_PRICE_CENTS_QUICK_MONTHLY: int = 399
    BILLING_PRICE_CENTS_QUICK_ANNUAL: int = 2400
    BILLING_PRICE_CENTS_STANDARD_MONTHLY: int = 699
    BILLING_PRICE_CENTS_STANDARD_ANNUAL: int = 4200
    BILLING_PRICE_CENTS_PREMIUM_MONTHLY: int = 899
    BILLING_PRICE_CENTS_PREMIUM_ANNUAL: int = 5400
    BILLING_DEFAULT_INTERVAL: str = "monthly"
    STRIPE_WEBHOOK_SECRET: str = ""
    FRONTEND_URL: str = "http://localhost:5173"
    MOBILE_CHECKOUT_SUCCESS_URL: str = "http://localhost:5173/mobile/billing/success"
    MOBILE_CHECKOUT_CANCEL_URL: str = "http://localhost:5173/mobile/billing/cancel"

    #: Transactional email (https://resend.com). Leave empty to skip sends in dev.
    RESEND_API_KEY: str = ""
    FROM_EMAIL: str = "MindFlip <noreply@i-educate.com>"
    EMAIL_DELIVERY_MODE: str = "disabled"
    EMAIL_TEST_RECIPIENTS: str = ""
    EMAIL_PRODUCTION_ENABLED: bool = False
    EMAIL_SENDING_DOMAIN_VERIFIED: bool = False
    EMAIL_WEBHOOK_SECRET: str = ""
    EMAIL_REPLY_TO: str = ""
    EMAIL_PUBLIC_BASE_URL: str = "http://localhost:8000"
    EMAIL_JOB_BATCH_SIZE: int = 50
    EMAIL_JOB_MAX_RETRIES: int = 5
    EMAIL_PROCESSING_TIMEOUT_MINUTES: int = 15
    EMAIL_CONTINUE_DELAY_HOURS: int = 24
    EMAIL_PROCESSOR_INTERVAL_SECONDS: int = 30
    EMAIL_RETRY_BASE_SECONDS: int = 30
    EMAIL_RETRY_MAX_SECONDS: int = 3600
    EMAIL_RETRY_JITTER_RATIO: float = 0.25
    EMAIL_UNSUBSCRIBE_SECRET: str = ""
    EMAIL_GLOBAL_ENABLED: bool = True
    EMAIL_WELCOME_ENABLED: bool = True
    EMAIL_CONTINUE_LEARNING_ENABLED: bool = True
    EMAIL_ACHIEVEMENT_ENABLED: bool = True
    EMAIL_WEEKLY_SUMMARY_ENABLED: bool = True
    ENGAGEMENT_AUTOMATION_ENABLED: bool = False
    WEEKLY_SUMMARY_SCAN_INTERVAL_MINUTES: int = 60
    INACTIVITY_SCAN_INTERVAL_MINUTES: int = 60
    STREAK_RISK_SCAN_INTERVAL_MINUTES: int = 15
    FAILED_DELIVERY_SCAN_INTERVAL_SECONDS: int = 60
    ENGAGEMENT_CLEANUP_INTERVAL_HOURS: int = 24
    AUTOMATION_BATCH_SIZE: int = 100
    AUTOMATION_MAX_BATCHES_PER_RUN: int = 5
    AUTOMATION_TASK_TIME_LIMIT_SECONDS: int = 300
    AUTOMATION_TASK_SOFT_TIME_LIMIT_SECONDS: int = 270
    INACTIVITY_THRESHOLD_HOURS: int = 72
    INACTIVITY_RECHECK_COOLDOWN_HOURS: int = 24
    STREAK_RISK_WINDOW_MINUTES: int = 120
    STREAK_RISK_RECHECK_MINUTES: int = 60
    ENGAGEMENT_STATE_RETENTION_DAYS: int = 90
    EMAIL_JOB_RETENTION_DAYS: int = 365
    EMAIL_DELIVERY_LOG_RETENTION_DAYS: int = 730
    PROVIDER_EVENT_RETENTION_DAYS: int = 30
    AUTOMATION_RUN_RETENTION_DAYS: int = 90
    ENGAGEMENT_CLEANUP_DRY_RUN: bool = True

    @property
    def email_test_recipients(self) -> set[str]:
        return {
            value.strip().lower()
            for value in self.EMAIL_TEST_RECIPIENTS.split(",")
            if value.strip()
        }

    def validate_email_policy(self) -> None:
        if self.EMAIL_DELIVERY_MODE not in {
            "disabled",
            "log_only",
            "test",
            "production",
        }:
            raise ValueError(
                "EMAIL_DELIVERY_MODE must be disabled, log_only, test, or production"
            )
        positive = {
            "EMAIL_JOB_BATCH_SIZE": self.EMAIL_JOB_BATCH_SIZE,
            "EMAIL_PROCESSING_TIMEOUT_MINUTES": self.EMAIL_PROCESSING_TIMEOUT_MINUTES,
            "EMAIL_CONTINUE_DELAY_HOURS": self.EMAIL_CONTINUE_DELAY_HOURS,
            "EMAIL_PROCESSOR_INTERVAL_SECONDS": self.EMAIL_PROCESSOR_INTERVAL_SECONDS,
            "EMAIL_RETRY_BASE_SECONDS": self.EMAIL_RETRY_BASE_SECONDS,
            "EMAIL_RETRY_MAX_SECONDS": self.EMAIL_RETRY_MAX_SECONDS,
        }
        for name, value in positive.items():
            if value <= 0:
                raise ValueError(f"{name} must be positive")
        if self.EMAIL_JOB_MAX_RETRIES < 0:
            raise ValueError("EMAIL_JOB_MAX_RETRIES must be non-negative")
        if self.EMAIL_RETRY_BASE_SECONDS > self.EMAIL_RETRY_MAX_SECONDS:
            raise ValueError(
                "EMAIL_RETRY_BASE_SECONDS cannot exceed EMAIL_RETRY_MAX_SECONDS"
            )
        if not 0 <= self.EMAIL_RETRY_JITTER_RATIO <= 1:
            raise ValueError("EMAIL_RETRY_JITTER_RATIO must be between 0 and 1")
        if not self.EMAIL_PUBLIC_BASE_URL.startswith(("http://", "https://")):
            raise ValueError("EMAIL_PUBLIC_BASE_URL must be an absolute http(s) URL")
        if (
            self.EMAIL_DELIVERY_MODE == "production"
            and not self.EMAIL_UNSUBSCRIBE_SECRET
        ):
            raise ValueError(
                "EMAIL_UNSUBSCRIBE_SECRET is required for production delivery"
            )

    def validate_automation_policy(self) -> None:
        bounded = {
            "WEEKLY_SUMMARY_SCAN_INTERVAL_MINUTES": (
                self.WEEKLY_SUMMARY_SCAN_INTERVAL_MINUTES,
                5,
                10080,
            ),
            "INACTIVITY_SCAN_INTERVAL_MINUTES": (
                self.INACTIVITY_SCAN_INTERVAL_MINUTES,
                5,
                10080,
            ),
            "STREAK_RISK_SCAN_INTERVAL_MINUTES": (
                self.STREAK_RISK_SCAN_INTERVAL_MINUTES,
                5,
                1440,
            ),
            "FAILED_DELIVERY_SCAN_INTERVAL_SECONDS": (
                self.FAILED_DELIVERY_SCAN_INTERVAL_SECONDS,
                10,
                3600,
            ),
            "ENGAGEMENT_CLEANUP_INTERVAL_HOURS": (
                self.ENGAGEMENT_CLEANUP_INTERVAL_HOURS,
                1,
                720,
            ),
            "AUTOMATION_BATCH_SIZE": (self.AUTOMATION_BATCH_SIZE, 1, 1000),
            "AUTOMATION_MAX_BATCHES_PER_RUN": (
                self.AUTOMATION_MAX_BATCHES_PER_RUN,
                1,
                100,
            ),
            "AUTOMATION_TASK_TIME_LIMIT_SECONDS": (
                self.AUTOMATION_TASK_TIME_LIMIT_SECONDS,
                30,
                3600,
            ),
            "AUTOMATION_TASK_SOFT_TIME_LIMIT_SECONDS": (
                self.AUTOMATION_TASK_SOFT_TIME_LIMIT_SECONDS,
                20,
                3500,
            ),
        }
        for name, (value, minimum, maximum) in bounded.items():
            if not minimum <= value <= maximum:
                raise ValueError(f"{name} must be between {minimum} and {maximum}")
        if (
            self.AUTOMATION_TASK_SOFT_TIME_LIMIT_SECONDS
            >= self.AUTOMATION_TASK_TIME_LIMIT_SECONDS
        ):
            raise ValueError(
                "automation soft time limit must be lower than hard time limit"
            )
        for name in (
            "INACTIVITY_THRESHOLD_HOURS",
            "INACTIVITY_RECHECK_COOLDOWN_HOURS",
            "STREAK_RISK_WINDOW_MINUTES",
            "STREAK_RISK_RECHECK_MINUTES",
            "ENGAGEMENT_STATE_RETENTION_DAYS",
            "EMAIL_JOB_RETENTION_DAYS",
            "EMAIL_DELIVERY_LOG_RETENTION_DAYS",
            "PROVIDER_EVENT_RETENTION_DAYS",
            "AUTOMATION_RUN_RETENTION_DAYS",
        ):
            if getattr(self, name) <= 0:
                raise ValueError(f"{name} must be positive")

    #: Server error reporting (https://sentry.io). Leave empty to disable.
    SENTRY_DSN_API: str = ""
    #: Shared secret for ``POST /health/sentry-verify`` (manual connectivity test). Leave empty to disable that route.
    SENTRY_VERIFY_SECRET: str = ""
    #: e.g. development, staging, production — forwarded to Sentry.
    ENVIRONMENT: str = "development"

    # Engagement rollout flags. Keep lifecycle sends disabled until production
    # preferences, schedules, and provider monitoring have been verified.
    ENGAGEMENT_NOTIFICATIONS_ENABLED: bool = True
    ENGAGEMENT_ACHIEVEMENTS_ENABLED: bool = True
    ENGAGEMENT_STREAKS_ENABLED: bool = True
    ENGAGEMENT_SCORECARDS_ENABLED: bool = True
    ENGAGEMENT_SHARING_ENABLED: bool = True
    SCORECARD_SHARE_ENABLED: bool = True
    SCORECARD_SHARE_IMAGE_ENABLED: bool = True
    PUBLIC_APP_URL: str = "http://localhost:5173"
    PUBLIC_SHARE_BASE_URL: str = "http://localhost:8000"
    SCORECARD_SHARE_DEFAULT_EXPIRY_DAYS: int = 30
    SCORECARD_SHARE_MAX_EXPIRY_DAYS: int = 90
    SCORECARD_SHARE_RATE_LIMIT_WINDOW_SEC: int = 60
    SCORECARD_SHARE_RATE_LIMIT_MAX_REQUESTS: int = 120
    ENGAGEMENT_LIFECYCLE_EMAILS_ENABLED: bool = False
    ENGAGEMENT_NUDGES_ENABLED: bool = True

    #: Sliding window (seconds) for Redis auth rate limit (login, register, Google, Apple).
    AUTH_RATE_LIMIT_WINDOW_SEC: int = 60
    #: Max credential-bearing auth attempts per client IP per window (0 = disable).
    AUTH_RATE_LIMIT_MAX_REQUESTS: int = 40

    def validate_scorecard_share_policy(self) -> None:
        for name in ("PUBLIC_APP_URL", "PUBLIC_SHARE_BASE_URL"):
            value = getattr(self, name).rstrip("/")
            if not value.startswith(("http://", "https://")):
                raise ValueError(f"{name} must be an absolute http(s) URL")
            if self.ENVIRONMENT == "production" and not value.startswith("https://"):
                raise ValueError(f"{name} must use HTTPS in production")
        if not 1 <= self.SCORECARD_SHARE_DEFAULT_EXPIRY_DAYS <= self.SCORECARD_SHARE_MAX_EXPIRY_DAYS:
            raise ValueError("scorecard share default expiry must be within the maximum")
        if not 1 <= self.SCORECARD_SHARE_MAX_EXPIRY_DAYS <= 365:
            raise ValueError("scorecard share maximum expiry must be between 1 and 365 days")

    #: When ``True``, free-tier users hit limits (3 books, 3 sets, 20 cards) and receive
    #: ``UPGRADE_REQUIRED``. Set ``False`` during development/testing.
    FREE_TIER_PAYWALL_ENABLED: bool = False

    @property
    def cors_origins_list(self) -> list[str]:
        return [
            origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()
        ]

    @property
    def cors_origin_regex(self) -> str | None:
        patterns: list[str] = []
        if self.CORS_ALLOW_VERCEL_PREVIEWS:
            patterns.append(_VERCEL_PREVIEW_ORIGIN_RE)
        if self.CORS_ORIGIN_REGEX.strip():
            patterns.extend(
                part.strip()
                for part in self.CORS_ORIGIN_REGEX.split(",")
                if part.strip()
            )
        if not patterns:
            return None
        return "|".join(patterns)

    @property
    def refresh_token_cookie_samesite(self) -> str:
        explicit = self.REFRESH_TOKEN_COOKIE_SAMESITE.strip().lower()
        if explicit:
            if explicit not in {"strict", "lax", "none"}:
                raise ValueError(
                    "REFRESH_TOKEN_COOKIE_SAMESITE must be strict, lax, or none"
                )
            return explicit
        if self.CORS_ALLOW_VERCEL_PREVIEWS or self.CORS_ORIGIN_REGEX.strip():
            return "none"
        return "strict"

    def validate_refresh_cookie_policy(self) -> None:
        if (
            self.refresh_token_cookie_samesite == "none"
            and not self.REFRESH_TOKEN_COOKIE_SECURE
        ):
            raise ValueError(
                "REFRESH_TOKEN_COOKIE_SAMESITE=none requires REFRESH_TOKEN_COOKIE_SECURE=true"
            )


settings = Settings()


def get_settings() -> Settings:
    return settings
