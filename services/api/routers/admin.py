"""Admin-only platform management (Section 1)."""

from __future__ import annotations

import asyncio
from datetime import UTC, date, datetime, timedelta, time
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import String, case, delete, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import require_role
from models.book import Book
from models.enums import BookStatus, UserRole, FeedbackStatus, SupportCategory, SupportConversationStatus, SupportSenderType
from models.feedback import Feedback, SupportConversation, SupportMessage
from models.flashcard import Flashcard, FlashcardSet, Workbook
from models.license import License
from models.quiz import StudyEvent
from models.token_usage import TokenUsage
from models.user_subscription import UserSubscription
from models.user import User
from services import entitlements as entitlements_service
from services.plan_catalog import plan_label_from_slug
from services.book_deletion import cascade_delete_book
from age_utils import AGE_GROUP_LABELS, dob_range_for_age_group
from schemas.admin import (
    AdminBookListPage,
    AdminBookRow,
    AdminFeedbackListPage,
    AdminFeedbackRow,
    AdminMetricsOut,
    AdminUserListPage,
    AdminUserRow,
    AdminUserUpdate,
    TopBookMetric,
    admin_user_row_from_model,
)
from schemas.feedback import (FeedbackAdminUpdate, FeedbackPublic, SupportMessageCreate,
    SupportMessagePublic, AdminConversationRow, AdminConversationPage, AdminConversationDetail,
    AdminSupportDashboard, CategoryCount)

from celery_health import inspect_celery_workers
from routers.admin_analytics import router as admin_analytics_router
from schemas.admin import AdminUserIpListPage, AdminUserIpRow
from services.stripe_reconciliation import reconcile_stripe
from routers.feedback import _apply_cursor, _encode_cursor

router = APIRouter(tags=["admin"])
router.include_router(admin_analytics_router)

_ACTIVE_LICENSE_STATUSES = ("active", "paid")


def _support_message_public(message: SupportMessage) -> SupportMessagePublic:
    read_at = message.admin_read_at if message.sender_type == SupportSenderType.user else message.user_read_at
    return SupportMessagePublic(id=message.id, conversation_id=message.conversation_id,
        sender_type=message.sender_type.value, body=message.body, category=message.category, client_message_id=message.client_message_id,
        created_at=message.created_at, read_at=read_at)


@router.post("/billing/reconcile")
async def reconcile_billing_now(
    _admin: Annotated[User, Depends(require_role("admin"))],
) -> dict[str, int]:
    return await asyncio.to_thread(reconcile_stripe)


@router.get("/celery-status")
async def admin_celery_status(
    _admin: Annotated[User, Depends(require_role("admin"))],
) -> dict:
    return inspect_celery_workers()


@router.get("/user-ips", response_model=AdminUserIpListPage)
async def list_user_ips(
    _admin: Annotated[User, Depends(require_role("admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AdminUserIpListPage:
    result = await db.execute(
        select(User.id, User.full_name, User.email, User.last_ip, User.ip_history, User.last_active_at)
        .order_by(User.last_active_at.desc().nullslast(), User.full_name.asc()),
    )
    items = [
        AdminUserIpRow(
            user_id=row.id,
            username=row.full_name,
            email=row.email,
            last_ip=row.last_ip,
            last_seen=row.last_active_at,
            ip_history=list(row.ip_history or []),
        )
        for row in result.all()
    ]
    return AdminUserIpListPage(items=items)


@router.get("/users", response_model=AdminUserListPage)
async def list_users(
    _admin: Annotated[User, Depends(require_role("admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
    q: str = Query(default="", max_length=100),
    age_group: str | None = Query(default=None, max_length=16),
    sort: str = Query(default="-created_at", max_length=32),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
) -> AdminUserListPage:
    term = q.strip()
    filters = []
    if term:
        like = f"%{term}%"
        filters.append(
            or_(
                User.full_name.ilike(like),
                User.email.ilike(like),
            ),
        )
    if age_group:
        if age_group not in AGE_GROUP_LABELS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid age_group. Use one of: {', '.join(AGE_GROUP_LABELS)}",
            )
        min_dob, max_dob = dob_range_for_age_group(age_group)
        filters.append(User.date_of_birth.is_not(None))
        filters.append(User.date_of_birth >= min_dob)
        filters.append(User.date_of_birth <= max_dob)

    count_stmt = select(func.count(User.id))
    list_stmt = select(User)
    if filters:
        count_stmt = count_stmt.where(*filters)
        list_stmt = list_stmt.where(*filters)
    total = int(await db.scalar(count_stmt) or 0)
    offset = (page - 1) * size

    if sort == "age":
        order_clause = User.date_of_birth.desc().nullslast()
    elif sort == "-age":
        order_clause = User.date_of_birth.asc().nullsfirst()
    elif sort == "created_at":
        order_clause = User.created_at.asc()
    else:
        order_clause = User.created_at.desc()

    result = await db.execute(
        list_stmt.order_by(order_clause).offset(offset).limit(size),
    )
    users = result.scalars().all()
    items = []
    for user in users:
        plan_slug = await entitlements_service._user_plan_slug(db, user)
        items.append(admin_user_row_from_model(user, plan=plan_label_from_slug(plan_slug)))
    return AdminUserListPage(items=items, total=total, page=page, size=size)


@router.patch("/users/{user_id}", response_model=AdminUserRow)
async def update_user(
    user_id: UUID,
    body: AdminUserUpdate,
    admin: Annotated[User, Depends(require_role("admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AdminUserRow:
    if body.role is None and body.is_banned is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if user_id == admin.id:
        if body.is_banned is True:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You cannot ban your own account",
            )
        if body.role is not None and body.role != UserRole.admin.value:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You cannot demote your own admin account",
            )

    if body.role is not None:
        user.role = UserRole(body.role)
    if body.is_banned is not None:
        user.is_banned = body.is_banned

    await db.commit()
    await db.refresh(user)
    return admin_user_row_from_model(user)


@router.get("/books", response_model=AdminBookListPage)
async def list_all_books(
    _admin: Annotated[User, Depends(require_role("admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    status_filter: BookStatus | None = Query(default=None, alias="status"),
    flagged: bool | None = Query(default=None),
) -> AdminBookListPage:
    base = (
        select(
            Book.id,
            Book.title,
            Book.author,
            Book.status,
            Book.created_at,
            Book.is_flagged,
            User.full_name.label("uploader_name"),
            User.email.label("uploader_email"),
        )
        .join(User, Book.user_id == User.id)
    )
    if status_filter is not None:
        base = base.where(Book.status == status_filter)
    if flagged is not None:
        base = base.where(Book.is_flagged == flagged)

    count_q = select(func.count()).select_from(Book).join(User, Book.user_id == User.id)
    if status_filter is not None:
        count_q = count_q.where(Book.status == status_filter)
    if flagged is not None:
        count_q = count_q.where(Book.is_flagged == flagged)
    total = int(await db.scalar(count_q) or 0)
    offset = (page - 1) * size
    result = await db.execute(
        base.order_by(Book.created_at.desc()).offset(offset).limit(size),
    )
    items = [
        AdminBookRow(
            id=row.id,
            title=row.title,
            author=row.author,
            uploader_name=row.uploader_name,
            uploader_email=row.uploader_email,
            status=row.status,
            created_at=row.created_at,
            is_flagged=row.is_flagged,
        )
        for row in result.all()
    ]
    return AdminBookListPage(items=items, total=total, page=page, size=size)


@router.post("/books/{book_id}/flag", response_model=AdminBookRow)
async def flag_book(
    book_id: UUID,
    _admin: Annotated[User, Depends(require_role("admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AdminBookRow:
    result = await db.execute(
        select(Book, User.full_name, User.email)
        .join(User, Book.user_id == User.id)
        .where(Book.id == book_id),
    )
    row = result.one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Book not found")
    book, uploader_name, uploader_email = row
    book.is_flagged = True
    await db.commit()
    await db.refresh(book)
    return AdminBookRow(
        id=book.id,
        title=book.title,
        author=book.author,
        uploader_name=uploader_name,
        uploader_email=uploader_email,
        status=book.status,
        created_at=book.created_at,
        is_flagged=book.is_flagged,
    )


@router.delete("/books/{book_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_book_admin(
    book_id: UUID,
    _admin: Annotated[User, Depends(require_role("admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    result = await db.execute(select(Book).where(Book.id == book_id))
    book = result.scalar_one_or_none()
    if book is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Book not found")

    await cascade_delete_book(db, book)


@router.get("/metrics", response_model=AdminMetricsOut)
async def get_platform_metrics(
    _admin: Annotated[User, Depends(require_role("admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AdminMetricsOut:
    today = date.today()
    day_start = datetime.combine(today, time.min, tzinfo=UTC)
    day_end = day_start + timedelta(days=1)
    thirty_days_ago_dt = datetime.combine(
        today - timedelta(days=30),
        time.min,
        tzinfo=UTC,
    )

    dau = int(
        await db.scalar(
            select(func.count(func.distinct(StudyEvent.user_id))).where(
                StudyEvent.created_at >= day_start,
                StudyEvent.created_at < day_end,
            ),
        )
        or 0,
    )
    signups_30d = int(
        await db.scalar(
            select(func.count(User.id)).where(User.created_at >= thirty_days_ago_dt),
        )
        or 0,
    )
    total_books = int(await db.scalar(select(func.count(Book.id))) or 0)
    ai_generations_30d = int(
        await db.scalar(
            select(func.count(StudyEvent.id)).where(
                StudyEvent.event_type == "ai_generation",
                StudyEvent.created_at >= thirty_days_ago_dt,
            ),
        )
        or 0,
    )
    active_subscription_statuses = ("active", "trialing", "past_due")
    monthly_cents = func.coalesce(func.sum(
        case(
            (UserSubscription.billing_interval == "year", UserSubscription.unit_amount_cents / func.nullif(UserSubscription.interval_count * 12, 0)),
            else_=UserSubscription.unit_amount_cents / func.nullif(UserSubscription.interval_count, 0),
        )
    ), 0)
    paying_users = int(
        await db.scalar(
            select(func.count(func.distinct(UserSubscription.user_id))).where(UserSubscription.status.in_(active_subscription_statuses)),
        )
        or 0,
    )
    mrr_raw = await db.scalar(
        select(monthly_cents).where(UserSubscription.status.in_(active_subscription_statuses)),
    )
    mrr = round(float(mrr_raw or 0) / 100, 2)

    top_result = await db.execute(
        select(Book.title, func.count(FlashcardSet.id).label("set_count"))
        .join(FlashcardSet, FlashcardSet.book_id == Book.id)
        .group_by(Book.id, Book.title)
        .order_by(func.count(FlashcardSet.id).desc())
        .limit(10),
    )
    top_books = [
        TopBookMetric(title=row.title, set_count=int(row.set_count)) for row in top_result.all()
    ]
    ai_cost_raw = await db.scalar(
        select(func.coalesce(func.sum(TokenUsage.estimated_cost_usd), 0)).where(
            TokenUsage.created_at >= thirty_days_ago_dt,
        ),
    )
    ai_cost_30d = float(ai_cost_raw or 0.0)

    return AdminMetricsOut(
        dau=dau,
        signups_30d=signups_30d,
        total_books=total_books,
        ai_generations_30d=ai_generations_30d,
        paying_users=paying_users,
        mrr_usd=mrr,
        top_books=top_books,
        ai_cost_30d_usd=round(ai_cost_30d, 4),
    )


@router.get("/feedback", response_model=AdminFeedbackListPage)
async def list_feedback(
    _admin: Annotated[User, Depends(require_role("admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    status: FeedbackStatus | None = Query(None),
    q: str = Query(default="", max_length=200),
) -> AdminFeedbackListPage:
    """Admin view of all submitted feedback."""
    list_stmt = select(Feedback, User.full_name, User.email).join(User, Feedback.user_id == User.id)
    count_stmt = select(func.count(Feedback.id))

    term = q.strip()
    if term:
        like = f"%{term}%"
        search_filter = or_(
            Feedback.content.ilike(like),
            User.full_name.ilike(like),
            User.email.ilike(like),
            Feedback.category.ilike(like),
        )
        list_stmt = list_stmt.where(search_filter)
        count_stmt = count_stmt.select_from(Feedback).join(User, Feedback.user_id == User.id).where(search_filter)

    if status:
        list_stmt = list_stmt.where(Feedback.status == status)
        count_stmt = count_stmt.where(Feedback.status == status)

    total = int(await db.scalar(count_stmt) or 0)
    offset = (page - 1) * size
    result = await db.execute(
        list_stmt.order_by(Feedback.created_at.desc()).offset(offset).limit(size)
    )

    items = [
        AdminFeedbackRow(
            id=row[0].id,
            user_id=row[0].user_id,
            user_name=row[1],
            user_email=row[2],
            content=row[0].content,
            category=row[0].category,
            status=row[0].status,
            created_at=row[0].created_at,
        )
        for row in result.all()
    ]
    return AdminFeedbackListPage(items=items, total=total, page=page, size=size)


@router.patch("/feedback/{feedback_id}", response_model=FeedbackPublic)
async def update_feedback_status(
    feedback_id: UUID,
    body: FeedbackAdminUpdate,
    _admin: Annotated[User, Depends(require_role("admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FeedbackPublic:
    """Mark feedback as reviewed or resolved."""
    result = await db.execute(select(Feedback).where(Feedback.id == feedback_id))
    feedback = result.scalar_one_or_none()
    if not feedback:
        raise HTTPException(status_code=404, detail="Feedback not found")

    feedback.status = body.status
    await db.commit()
    await db.refresh(feedback)
    return FeedbackPublic.model_validate(feedback)


@router.get("/feedback/conversations", response_model=AdminConversationPage)
async def list_support_conversations(
    _admin: Annotated[User, Depends(require_role("admin"))], db: Annotated[AsyncSession, Depends(get_db)],
    filter: str = Query("all", pattern="^(all|unread|read|resolved)$"), q: str = Query("", max_length=200),
    page: int = Query(1, ge=1), size: int = Query(30, ge=1, le=100), category: SupportCategory | None = None,
):
    latest_body = select(SupportMessage.body).where(SupportMessage.conversation_id == SupportConversation.id).order_by(SupportMessage.created_at.desc()).limit(1).scalar_subquery()
    latest_category = select(SupportMessage.category).where(SupportMessage.conversation_id == SupportConversation.id, SupportMessage.sender_type == SupportSenderType.user, SupportMessage.category.is_not(None)).order_by(SupportMessage.created_at.desc(), SupportMessage.id.desc()).limit(1).scalar_subquery()
    base = select(SupportConversation, User.full_name, User.email, latest_body.label("preview"), latest_category.label("latest_category")).join(User, User.id == SupportConversation.user_id)
    count = select(func.count(SupportConversation.id)).select_from(SupportConversation).join(User, User.id == SupportConversation.user_id)
    conditions = []
    if filter == "unread": conditions.append(SupportConversation.admin_unread_count > 0)
    elif filter == "read": conditions.extend([SupportConversation.admin_unread_count == 0, SupportConversation.status == SupportConversationStatus.open])
    elif filter == "resolved": conditions.append(SupportConversation.status == SupportConversationStatus.resolved)
    term = q.strip()
    if term:
        like = f"%{term}%"
        conditions.append(or_(User.full_name.ilike(like), User.email.ilike(like), func.cast(User.id, String).ilike(like)))
    if category:
        conditions.append(latest_category == category)
    if conditions:
        base = base.where(*conditions); count = count.where(*conditions)
    total = int(await db.scalar(count) or 0)
    unread = int(await db.scalar(select(func.count(SupportConversation.id)).where(SupportConversation.admin_unread_count > 0)) or 0)
    rows = (await db.execute(base.order_by(SupportConversation.last_message_at.desc()).offset((page - 1) * size).limit(size))).all()
    return AdminConversationPage(items=[AdminConversationRow(id=c.id, user_id=c.user_id, user_name=name,
        user_email=email, status=c.status.value, last_message_preview=preview or "", last_message_at=c.last_message_at,
        admin_unread_count=c.admin_unread_count, latest_user_category=latest_cat) for c, name, email, preview, latest_cat in rows], total=total, page=page, size=size, unread_conversations=unread)


@router.get("/feedback/dashboard", response_model=AdminSupportDashboard)
async def support_dashboard(
    _admin: Annotated[User, Depends(require_role("admin"))], db: Annotated[AsyncSession, Depends(get_db)],
    range: Literal["7d", "30d", "all"] = Query("7d"),
):
    now = datetime.now(UTC)
    since = now - timedelta(days=7 if range == "7d" else 30) if range != "all" else None
    open_count = int(await db.scalar(select(func.count(SupportConversation.id)).where(SupportConversation.status == SupportConversationStatus.open)) or 0)
    unread_count = int(await db.scalar(select(func.count(SupportConversation.id)).where(SupportConversation.status == SupportConversationStatus.open, SupportConversation.admin_unread_count > 0)) or 0)
    resolved_count = int(await db.scalar(select(func.count(SupportConversation.id)).where(SupportConversation.status == SupportConversationStatus.resolved)) or 0)
    new_stmt = select(func.count(SupportConversation.id))
    if since is not None: new_stmt = new_stmt.where(SupportConversation.created_at >= since)
    new_count = int(await db.scalar(new_stmt) or 0)
    latest_category = select(SupportMessage.category).where(SupportMessage.conversation_id == SupportConversation.id,
        SupportMessage.sender_type == SupportSenderType.user, SupportMessage.category.is_not(None)).order_by(SupportMessage.created_at.desc(), SupportMessage.id.desc()).limit(1).scalar_subquery()
    categorized = select(SupportConversation.id.label("conversation_id"), latest_category.label("category")).where(SupportConversation.status == SupportConversationStatus.open).subquery()
    category_rows = (await db.execute(select(categorized.c.category, func.count(categorized.c.conversation_id)).where(categorized.c.category.is_not(None)).group_by(categorized.c.category))).all()
    latest_body = select(SupportMessage.body).where(SupportMessage.conversation_id == SupportConversation.id).order_by(SupportMessage.created_at.desc(), SupportMessage.id.desc()).limit(1).scalar_subquery()
    recent = (await db.execute(select(SupportConversation, User.full_name, User.email, latest_body.label("preview"), latest_category.label("latest_category")).join(User, User.id == SupportConversation.user_id).order_by(SupportConversation.last_message_at.desc()).limit(8))).all()
    return AdminSupportDashboard(open_conversations=open_count, unread_conversations=unread_count,
        resolved_conversations=resolved_count, new_conversations=new_count, range=range,
        categories=[CategoryCount(category=category, count=int(count)) for category, count in category_rows],
        recent_activity=[AdminConversationRow(id=c.id, user_id=c.user_id, user_name=name, user_email=email,
            status=c.status.value, last_message_preview=preview or "", last_message_at=c.last_message_at,
            admin_unread_count=c.admin_unread_count, latest_user_category=category) for c, name, email, preview, category in recent])


@router.get("/feedback/conversations/{conversation_id}", response_model=AdminConversationDetail)
async def get_support_conversation(conversation_id: UUID, _admin: Annotated[User, Depends(require_role("admin"))],
    db: Annotated[AsyncSession, Depends(get_db)], before: str | None = None, limit: int = Query(50, ge=1, le=100)):
    row = (await db.execute(select(SupportConversation, User.full_name, User.email).join(User, User.id == SupportConversation.user_id).where(SupportConversation.id == conversation_id).with_for_update())).one_or_none()
    if not row: raise HTTPException(404, "Conversation not found")
    conversation, name, email = row
    now = datetime.now(UTC)
    await db.execute(update(SupportMessage).where(SupportMessage.conversation_id == conversation_id, SupportMessage.sender_type == SupportSenderType.user, SupportMessage.admin_read_at.is_(None)).values(admin_read_at=now))
    conversation.admin_unread_count = 0
    stmt = select(SupportMessage).where(SupportMessage.conversation_id == conversation_id)
    stmt = _apply_cursor(stmt, before)
    messages = list((await db.scalars(stmt.order_by(SupportMessage.created_at.desc(), SupportMessage.id.desc()).limit(limit + 1))).all())
    has_more = len(messages) > limit; messages = messages[:limit]; messages.reverse(); await db.commit()
    return AdminConversationDetail(id=conversation.id, status=conversation.status.value, unread_support_messages=conversation.user_unread_count,
        messages=[_support_message_public(m) for m in messages], next_cursor=_encode_cursor(messages[0]) if has_more else None,
        user_id=conversation.user_id, user_name=name, user_email=email, admin_unread_count=0)


@router.post("/feedback/conversations/{conversation_id}/messages", response_model=SupportMessagePublic)
async def reply_support_conversation(conversation_id: UUID, body: SupportMessageCreate,
    admin: Annotated[User, Depends(require_role("admin"))], db: Annotated[AsyncSession, Depends(get_db)]):
    conversation = await db.scalar(select(SupportConversation).where(SupportConversation.id == conversation_id).with_for_update())
    if not conversation: raise HTTPException(404, "Conversation not found")
    existing = await db.scalar(select(SupportMessage).where(SupportMessage.conversation_id == conversation_id, SupportMessage.client_message_id == body.client_message_id))
    if existing: return _support_message_public(existing)
    now = datetime.now(UTC); message = SupportMessage(conversation_id=conversation_id, sender_type=SupportSenderType.admin,
        sender_admin_id=admin.id, body=body.message, category=None, client_message_id=body.client_message_id, created_at=now, admin_read_at=now)
    db.add(message); conversation.last_message_at = now; conversation.last_admin_message_at = now; conversation.user_unread_count += 1
    await db.commit(); await db.refresh(message); return _support_message_public(message)


async def _set_support_status(conversation_id: UUID, admin: User, db: AsyncSession, resolved: bool):
    conversation = await db.scalar(select(SupportConversation).where(SupportConversation.id == conversation_id).with_for_update())
    if not conversation: raise HTTPException(404, "Conversation not found")
    conversation.status = SupportConversationStatus.resolved if resolved else SupportConversationStatus.open
    conversation.resolved_at = datetime.now(UTC) if resolved else None
    conversation.resolved_by_admin_id = admin.id if resolved else None
    await db.commit()
    return {"status": conversation.status.value}


@router.post("/feedback/conversations/{conversation_id}/resolve")
async def resolve_support_conversation(conversation_id: UUID, admin: Annotated[User, Depends(require_role("admin"))], db: Annotated[AsyncSession, Depends(get_db)]):
    return await _set_support_status(conversation_id, admin, db, True)


@router.post("/feedback/conversations/{conversation_id}/reopen")
async def reopen_support_conversation(conversation_id: UUID, admin: Annotated[User, Depends(require_role("admin"))], db: Annotated[AsyncSession, Depends(get_db)]):
    return await _set_support_status(conversation_id, admin, db, False)
