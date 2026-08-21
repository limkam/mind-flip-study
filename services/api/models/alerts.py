"""Owner Console alert threshold breaches (Module 8)."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, Index, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from database import Base


class AlertEvent(Base):
    """One row per threshold breach detected by the alert evaluator task. Used both to
    drive the Alerts dashboard's recent-breaches list and to dedupe/cooldown repeat Slack
    notifications for the same still-breached metric (resolved_at is null while ongoing)."""

    __tablename__ = "alert_events"
    __table_args__ = (
        Index("ix_alert_events_metric_triggered", "metric_key", "triggered_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    metric_key: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    severity: Mapped[str] = mapped_column(String(16), nullable=False, default="warning")
    value: Mapped[float] = mapped_column(Float, nullable=False)
    threshold: Mapped[float] = mapped_column(Float, nullable=False)
    message: Mapped[str] = mapped_column(String(512), nullable=False)
    triggered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
