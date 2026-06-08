"""User ORM — full columns align with PostgreSQL migration (Section 2)."""

import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Enum as SAEnum, String, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from database import Base
from models.enums import UserRole


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    email: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        unique=True,
    )
    hashed_password: Mapped[str | None] = mapped_column(String(255), nullable=True)
    role: Mapped[UserRole] = mapped_column(
        SAEnum(UserRole, name="user_role", native_enum=True),
        nullable=False,
    )
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    country: Mapped[str | None] = mapped_column(String(128), nullable=True)
    custom_country: Mapped[str | None] = mapped_column(String(128), nullable=True)
    continent: Mapped[str | None] = mapped_column(String(64), nullable=True)
    date_of_birth: Mapped[date | None] = mapped_column(Date, nullable=True)
    occupation: Mapped[str | None] = mapped_column(String(100), nullable=True)
    job_title: Mapped[str | None] = mapped_column(String(100), nullable=True)
    onboarding_completed: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default=text("false"),
    )
    last_ip: Mapped[str | None] = mapped_column(String(45), nullable=True)
    ip_history: Mapped[list] = mapped_column(
        JSONB,
        nullable=False,
        server_default=text("'[]'::jsonb"),
    )
    last_active_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    avatar_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    stripe_customer_id: Mapped[str | None] = mapped_column(String(255), nullable=True, unique=True)
    # Tier today: "free" | "student". Future: subscription_status, subscription_renewal_date,
    # subscription_cancel_at (see billing webhook + Stripe Customer Portal).
    subscription_tier: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default="free",
        server_default=text("'free'"),
    )
    oauth_apple_sub: Mapped[str | None] = mapped_column(String(255), nullable=True, unique=True)
    push_token: Mapped[str | None] = mapped_column(String(512), nullable=True)
    push_platform: Mapped[str | None] = mapped_column(String(16), nullable=True)
    is_banned: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default=text("false"),
    )
    preferences: Mapped[dict] = mapped_column(
        JSONB,
        nullable=False,
        server_default=text("'{}'::jsonb"),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
