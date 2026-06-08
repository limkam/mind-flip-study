"""Admin-only platform management (Section 1)."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta, time
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import require_role
from models.book import Book
from models.enums import BookStatus, UserRole, FeedbackStatus
from models.feedback import Feedback
from models.flashcard import Flashcard, FlashcardSet, Workbook
from models.quiz import StudyEvent
from models.token_usage import TokenUsage
from models.user import User
from s3_cleanup import delete_book_s3_assets
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
from schemas.feedback import FeedbackAdminUpdate, FeedbackPublic

from celery_health import inspect_celery_workers
from routers.admin_analytics import router as admin_analytics_router
from schemas.admin import AdminUserIpListPage, AdminUserIpRow

router = APIRouter(tags=["admin"])
router.include_router(admin_analytics_router)


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
    items = [admin_user_row_from_model(u) for u in result.scalars().all()]
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

    delete_book_s3_assets(s3_key=book.s3_key, extras=book.extras)
    # Workbooks are JSONB in DB (no S3); remove sets, cards, workbooks, then book.
    set_ids = (
        await db.scalars(select(FlashcardSet.id).where(FlashcardSet.book_id == book.id))
    ).all()
    if set_ids:
        await db.execute(delete(Flashcard).where(Flashcard.set_id.in_(set_ids)))
        await db.execute(delete(FlashcardSet).where(FlashcardSet.book_id == book.id))
    await db.execute(delete(Workbook).where(Workbook.book_id == book.id))
    await db.execute(delete(Book).where(Book.id == book.id))
    await db.commit()


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
    paying_users = int(
        await db.scalar(select(func.count(User.id)).where(User.subscription_tier == "student"))
        or 0,
    )
    mrr = paying_users * 8

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
