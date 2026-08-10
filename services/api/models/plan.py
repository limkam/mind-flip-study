"""Subscription plan definitions and allowances."""

import uuid
from datetime import datetime

from sqlalchemy import Integer, String, DateTime
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from database import Base


class Plan(Base):
    __tablename__ = "plans"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    slug: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    # monthly allowances
    monthly_content_allowance: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    monthly_regen_allowance: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # Stripe product/price ids mapping, stored as JSON for flexibility
    price_ids: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="'{}'::jsonb")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
