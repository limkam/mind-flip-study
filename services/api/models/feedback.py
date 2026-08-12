import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Enum as SAEnum, ForeignKey, Index, Integer, String, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base
from models.enums import FeedbackStatus, SupportCategory, SupportConversationStatus, SupportSenderType


class Feedback(Base):
    __tablename__ = "feedbacks"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str | None] = mapped_column(String(50), nullable=True)
    status: Mapped[FeedbackStatus] = mapped_column(
        SAEnum(FeedbackStatus, name="feedback_status", native_enum=True),
        nullable=False,
        default=FeedbackStatus.pending,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )

    user = relationship("User", backref="feedbacks")


class SupportConversation(Base):
    __tablename__ = "support_conversations"
    __table_args__ = (
        CheckConstraint("user_unread_count >= 0", name="ck_support_conversation_user_unread_nonnegative"),
        CheckConstraint("admin_unread_count >= 0", name="ck_support_conversation_admin_unread_nonnegative"),
        CheckConstraint("(status = 'resolved' AND resolved_at IS NOT NULL AND resolved_by_admin_id IS NOT NULL) OR (status = 'open' AND resolved_at IS NULL AND resolved_by_admin_id IS NULL)", name="ck_support_conversation_resolution_consistent"),
        Index("ix_support_conversations_status_activity", "status", "last_message_at"),
        Index("ix_support_conversations_admin_unread_activity", "admin_unread_count", "last_message_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    status: Mapped[SupportConversationStatus] = mapped_column(SAEnum(SupportConversationStatus, name="support_conversation_status", native_enum=True), nullable=False, default=SupportConversationStatus.open)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    last_message_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False, index=True)
    last_user_message_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_admin_message_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    user_unread_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))
    admin_unread_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolved_by_admin_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))

    user = relationship("User", foreign_keys=[user_id])
    messages = relationship("SupportMessage", back_populates="conversation", order_by="SupportMessage.created_at", cascade="all, delete-orphan")


class SupportMessage(Base):
    __tablename__ = "support_messages"
    __table_args__ = (
        UniqueConstraint("conversation_id", "client_message_id", name="uq_support_message_client_id"),
        CheckConstraint("char_length(btrim(body)) BETWEEN 1 AND 5000", name="ck_support_message_body_length"),
        CheckConstraint("(sender_type = 'user' AND sender_user_id IS NOT NULL AND sender_admin_id IS NULL) OR (sender_type = 'admin' AND sender_admin_id IS NOT NULL AND sender_user_id IS NULL)", name="ck_support_message_sender_integrity"),
        Index("ix_support_messages_conversation_created_id", "conversation_id", "created_at", "id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    conversation_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("support_conversations.id", ondelete="CASCADE"), nullable=False, index=True)
    sender_type: Mapped[SupportSenderType] = mapped_column(SAEnum(SupportSenderType, name="support_sender_type", native_enum=True), nullable=False)
    sender_user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    sender_admin_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    body: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[SupportCategory | None] = mapped_column(SAEnum(SupportCategory, name="support_category", native_enum=True), nullable=True)
    client_message_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False, index=True)
    user_read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    admin_read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    conversation = relationship("SupportConversation", back_populates="messages")
