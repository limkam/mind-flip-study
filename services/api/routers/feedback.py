from datetime import datetime, timezone
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import get_current_user
from models.enums import SupportCategory, SupportConversationStatus, SupportSenderType
from models.feedback import Feedback, SupportConversation, SupportMessage
from models.user import User
from schemas.feedback import FeedbackCreate, FeedbackPublic, SupportConversationPublic, SupportMessageCreate, SupportMessagePublic

router = APIRouter(prefix="/feedback", tags=["feedback"])


def _encode_cursor(message: SupportMessage) -> str:
    return f"{message.created_at.isoformat()}|{message.id}"


def _apply_cursor(stmt, before: str | None):
    if not before:
        return stmt
    try:
        raw_time, raw_id = before.rsplit("|", 1)
        cursor_time, cursor_id = datetime.fromisoformat(raw_time), __import__("uuid").UUID(raw_id)
    except (ValueError, TypeError) as exc:
        raise HTTPException(status_code=422, detail="Invalid message cursor") from exc
    return stmt.where(or_(SupportMessage.created_at < cursor_time,
        (SupportMessage.created_at == cursor_time) & (SupportMessage.id < cursor_id)))


def _message_public(message: SupportMessage) -> SupportMessagePublic:
    read_at = message.admin_read_at if message.sender_type == SupportSenderType.user else message.user_read_at
    return SupportMessagePublic(
        id=message.id, conversation_id=message.conversation_id, sender_type=message.sender_type.value,
        body=message.body, category=message.category, client_message_id=message.client_message_id, created_at=message.created_at, read_at=read_at,
    )


async def _send_user_message(db: AsyncSession, user: User, body: str, client_message_id, category: SupportCategory | None = None, *, require_initial_category: bool = False):
    # Serializes the no-conversation case too; SELECT FOR UPDATE cannot lock a
    # row that does not exist. The unique user constraint remains the backstop.
    await db.execute(select(func.pg_advisory_xact_lock(func.hashtextextended(str(user.id), 0))))
    conversation = await db.scalar(select(SupportConversation).where(SupportConversation.user_id == user.id).with_for_update())
    now = datetime.now(timezone.utc)
    if conversation is None:
        if require_initial_category and category is None:
            raise HTTPException(status_code=422, detail="Category is required for the first support message")
        conversation = SupportConversation(user_id=user.id, last_message_at=now)
        db.add(conversation)
        await db.flush()
    existing = await db.scalar(select(SupportMessage).where(SupportMessage.conversation_id == conversation.id, SupportMessage.client_message_id == client_message_id))
    if existing:
        return existing
    message = SupportMessage(conversation_id=conversation.id, sender_type=SupportSenderType.user, sender_user_id=user.id, body=body, category=category, client_message_id=client_message_id, created_at=now)
    db.add(message)
    conversation.last_message_at = now
    conversation.last_user_message_at = now
    conversation.admin_unread_count += 1
    conversation.status = SupportConversationStatus.open
    conversation.resolved_at = None
    conversation.resolved_by_admin_id = None
    await db.commit()
    await db.refresh(message)
    return message


@router.get("/conversation", response_model=SupportConversationPublic)
async def get_conversation(
    current_user: Annotated[User, Depends(get_current_user)], db: Annotated[AsyncSession, Depends(get_db)],
    before: str | None = Query(None), limit: int = Query(50, ge=1, le=100),
):
    conversation = await db.scalar(select(SupportConversation).where(SupportConversation.user_id == current_user.id).with_for_update())
    if not conversation:
        return SupportConversationPublic()
    now = datetime.now(timezone.utc)
    await db.execute(update(SupportMessage).where(SupportMessage.conversation_id == conversation.id, SupportMessage.sender_type == SupportSenderType.admin, SupportMessage.user_read_at.is_(None)).values(user_read_at=now))
    conversation.user_unread_count = 0
    stmt = select(SupportMessage).where(SupportMessage.conversation_id == conversation.id)
    stmt = _apply_cursor(stmt, before)
    rows = list((await db.scalars(stmt.order_by(SupportMessage.created_at.desc(), SupportMessage.id.desc()).limit(limit + 1))).all())
    await db.commit()
    has_more = len(rows) > limit
    rows = rows[:limit]
    rows.reverse()
    return SupportConversationPublic(id=conversation.id, status=conversation.status.value, unread_support_messages=0, messages=[_message_public(m) for m in rows], next_cursor=_encode_cursor(rows[0]) if has_more else None)


@router.post("/messages", response_model=SupportMessagePublic, status_code=status.HTTP_201_CREATED)
async def send_message(body: SupportMessageCreate, current_user: Annotated[User, Depends(get_current_user)], db: Annotated[AsyncSession, Depends(get_db)]):
    return _message_public(await _send_user_message(db, current_user, body.message, body.client_message_id, body.category, require_initial_category=True))


@router.post("", response_model=FeedbackPublic, status_code=status.HTTP_201_CREATED)
async def create_feedback(body: FeedbackCreate, current_user: Annotated[User, Depends(get_current_user)], db: Annotated[AsyncSession, Depends(get_db)]):
    """Legacy compatibility: retain the old record and also append to support chat."""
    feedback = Feedback(user_id=current_user.id, content=body.content, category=body.category)
    db.add(feedback)
    await db.flush()
    legacy_categories = {"General": SupportCategory.general, "General Feedback": SupportCategory.general,
        "Bug Report": SupportCategory.bug_report, "Feature Request": SupportCategory.feature_request,
        "Account": SupportCategory.account, "Billing": SupportCategory.billing, "Other": SupportCategory.other}
    await _send_user_message(db, current_user, body.content, uuid4(), legacy_categories.get(body.category or ""))
    await db.refresh(feedback)
    return FeedbackPublic.model_validate(feedback)
