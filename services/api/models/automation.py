"""Indexed engagement automation cursors and durable run summaries."""

import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from database import Base


class EngagementAutomationSchedule(Base):
    __tablename__ = "engagement_automation_schedules"
    __table_args__ = (
        UniqueConstraint(
            "user_id", "automation_type", name="uq_automation_schedule_user_type"
        ),
        CheckConstraint(
            "status IN ('active','paused','disabled')",
            name="ck_automation_schedule_status",
        ),
        Index(
            "ix_automation_schedule_due",
            "automation_type",
            "status",
            "next_evaluation_at",
            "id",
        ),
        Index("ix_automation_schedule_failed", "failure_count", "last_failure_at"),
        Index("ix_automation_schedule_lease", "status", "locked_at"),
    )
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    automation_type: Mapped[str] = mapped_column(String(40), nullable=False)
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, server_default="active"
    )
    next_evaluation_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    last_evaluated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_success_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_failure_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    failure_count: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0"
    )
    locked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    correlation_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    context: Mapped[dict] = mapped_column(
        JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class EngagementAutomationRun(Base):
    __tablename__ = "engagement_automation_runs"
    __table_args__ = (
        UniqueConstraint("idempotency_key", name="uq_automation_run_idempotency"),
        Index("ix_automation_runs_type_started", "automation_type", "started_at"),
        Index("ix_automation_runs_cleanup", "completed_at"),
    )
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    automation_type: Mapped[str] = mapped_column(String(40), nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(255), nullable=False)
    correlation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, default=uuid.uuid4
    )
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, server_default="running"
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    batch_count: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0"
    )
    claimed_count: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0"
    )
    evaluated_count: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0"
    )
    scheduled_count: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0"
    )
    suppressed_count: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0"
    )
    cancelled_count: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0"
    )
    retried_count: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0"
    )
    failed_count: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0"
    )
    skipped_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    remaining_due_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    last_error_code: Mapped[str | None] = mapped_column(String(64))
    last_error_message: Mapped[str | None] = mapped_column(Text)
    worker_id: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
