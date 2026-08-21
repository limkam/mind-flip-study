"""Compliance queues (Module 7) — DMCA notices and privacy (access/deletion) requests.

Display-only for this pass, per the build spec (no workflow/action endpoints yet) — these
tables exist so the Compliance dashboard has somewhere real to read from; an intake flow to
populate them is a separate, later piece of work.
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from database import Base


class DmcaNotice(Base):
    __tablename__ = "dmca_notices"
    __table_args__ = (
        Index("ix_dmca_notices_status_received", "status", "received_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    book_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("books.id", ondelete="SET NULL"), nullable=True)
    target_user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    claimant_name: Mapped[str] = mapped_column(String(255), nullable=False)
    claimant_email: Mapped[str] = mapped_column(String(255), nullable=False)
    work_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    # received/content_removed/counter_notice_filed/reinstated/rejected/closed
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="received")
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    statutory_response_deadline: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    counter_notice_filed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class PrivacyRequest(Base):
    __tablename__ = "privacy_requests"
    __table_args__ = (
        Index("ix_privacy_requests_status_received", "status", "received_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    requester_email: Mapped[str] = mapped_column(String(255), nullable=False)
    request_type: Mapped[str] = mapped_column(String(32), nullable=False)  # access/deletion/correction
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="received")
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    sla_deadline: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
