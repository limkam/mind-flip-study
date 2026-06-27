"""Leaderboard — PostgreSQL-backed with correct user joins and identity resolution."""

from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import get_current_user
from models.quiz import CardProgress, QuizResult
from models.user import User
from schemas.pagination import total_pages
from services.connected_users import connected_user_ids
from user_identity import resolve_display_name

router = APIRouter(tags=["leaderboard"])

LeaderboardMetric = Literal["avg_score", "most_quizzes", "cards_mastered", "xp"]

METRIC_LABELS: dict[str, str] = {
    "avg_score": "Avg Score",
    "most_quizzes": "Quizzes",
    "cards_mastered": "Cards Mastered",
    "xp": "XP",
}


class LeaderboardItemOut(BaseModel):
    rank: int
    user_id: str
    full_name: str
    avatar_url: str | None = None
    value: float
    metric: str
    xp: float = Field(description="Backward-compatible alias for value when metric=xp")


class LeaderboardPageOut(BaseModel):
    items: list[LeaderboardItemOut]
    total: int
    page: int
    size: int
    has_more: bool
    total_pages: int
    metric: str
    metric_label: str


class LeaderboardMeOut(BaseModel):
    rank: int | None = Field(description="1-based rank, or null if not ranked for this metric")
    value: float
    metric: str
    metric_label: str
    xp: float = Field(description="Backward-compatible alias when metric=xp")


def _clamp_size(size: int) -> int:
    return max(1, min(size, 100))


def _mastered_filter():
    return or_(
        CardProgress.repetitions >= 3,
        and_(CardProgress.repetitions >= 1, CardProgress.ease_factor >= 2.5),
    )


def _avg_score_expr():
    return case(
        (QuizResult.total_questions > 0, QuizResult.score * 100.0 / QuizResult.total_questions),
        else_=0.0,
    )


async def _count_leaderboard_users(
    db: AsyncSession,
    metric: LeaderboardMetric,
    *,
    allowed_ids: set,
) -> int:
    if not allowed_ids:
        return 0
    id_filter = User.id.in_(allowed_ids)
    if metric in ("avg_score", "most_quizzes", "xp"):
        having = (
            func.count(QuizResult.id) > 0
            if metric != "xp"
            else func.coalesce(func.sum(QuizResult.score), 0) > 0
        )
        subq = (
            select(User.id)
            .join(QuizResult, QuizResult.user_id == User.id)
            .where(User.is_banned.is_(False), id_filter)
            .group_by(User.id)
            .having(having)
        ).subquery()
        r = await db.execute(select(func.count()).select_from(subq))
        return int(r.scalar() or 0)

    subq = (
        select(User.id)
        .join(CardProgress, CardProgress.user_id == User.id)
        .where(User.is_banned.is_(False), _mastered_filter(), id_filter)
        .group_by(User.id)
        .having(func.count(CardProgress.id) > 0)
    ).subquery()
    r = await db.execute(select(func.count()).select_from(subq))
    return int(r.scalar() or 0)


async def _fetch_leaderboard_page(
    db: AsyncSession,
    metric: LeaderboardMetric,
    *,
    offset: int,
    limit: int,
    allowed_ids: set,
) -> list[tuple]:
    if not allowed_ids:
        return []
    id_filter = User.id.in_(allowed_ids)
    if metric == "avg_score":
        pct = _avg_score_expr()
        stmt = (
            select(
                User.id,
                User.full_name,
                User.email,
                User.avatar_url,
                func.avg(pct).label("value"),
            )
            .join(QuizResult, QuizResult.user_id == User.id)
            .where(User.is_banned.is_(False), id_filter)
            .group_by(User.id, User.full_name, User.email, User.avatar_url)
            .having(func.count(QuizResult.id) > 0)
            .order_by(func.avg(pct).desc(), User.full_name.asc())
            .offset(offset)
            .limit(limit)
        )
        r = await db.execute(stmt)
        return list(r.all())

    if metric == "most_quizzes":
        stmt = (
            select(
                User.id,
                User.full_name,
                User.email,
                User.avatar_url,
                func.count(QuizResult.id).label("value"),
            )
            .join(QuizResult, QuizResult.user_id == User.id)
            .where(User.is_banned.is_(False), id_filter)
            .group_by(User.id, User.full_name, User.email, User.avatar_url)
            .having(func.count(QuizResult.id) > 0)
            .order_by(func.count(QuizResult.id).desc(), User.full_name.asc())
            .offset(offset)
            .limit(limit)
        )
        r = await db.execute(stmt)
        return list(r.all())

    if metric == "cards_mastered":
        stmt = (
            select(
                User.id,
                User.full_name,
                User.email,
                User.avatar_url,
                func.count(CardProgress.id).label("value"),
            )
            .join(CardProgress, CardProgress.user_id == User.id)
            .where(User.is_banned.is_(False), _mastered_filter())
            .group_by(User.id, User.full_name, User.email, User.avatar_url)
            .having(func.count(CardProgress.id) > 0)
            .order_by(func.count(CardProgress.id).desc(), User.full_name.asc())
            .offset(offset)
            .limit(limit)
        )
        r = await db.execute(stmt)
        return list(r.all())

    stmt = (
        select(
            User.id,
            User.full_name,
            User.email,
            User.avatar_url,
            func.coalesce(func.sum(QuizResult.score), 0).label("value"),
        )
        .join(QuizResult, QuizResult.user_id == User.id)
        .where(User.is_banned.is_(False), id_filter)
        .group_by(User.id, User.full_name, User.email, User.avatar_url)
        .having(func.coalesce(func.sum(QuizResult.score), 0) > 0)
        .order_by(func.coalesce(func.sum(QuizResult.score), 0).desc(), User.full_name.asc())
        .offset(offset)
        .limit(limit)
    )
    r = await db.execute(stmt)
    return list(r.all())


async def _user_metric_value(db: AsyncSession, user_id, metric: LeaderboardMetric) -> float:
    if metric == "avg_score":
        pct = _avg_score_expr()
        stmt = (
            select(func.avg(pct))
            .select_from(QuizResult)
            .where(QuizResult.user_id == user_id)
        )
        r = await db.execute(stmt)
        return float(r.scalar() or 0)

    if metric == "most_quizzes":
        stmt = select(func.count()).select_from(QuizResult).where(QuizResult.user_id == user_id)
        r = await db.execute(stmt)
        return float(r.scalar() or 0)

    if metric == "cards_mastered":
        stmt = (
            select(func.count())
            .select_from(CardProgress)
            .where(CardProgress.user_id == user_id, _mastered_filter())
        )
        r = await db.execute(stmt)
        return float(r.scalar() or 0)

    stmt = (
        select(func.coalesce(func.sum(QuizResult.score), 0))
        .select_from(QuizResult)
        .where(QuizResult.user_id == user_id)
    )
    r = await db.execute(stmt)
    return float(r.scalar() or 0)


async def _user_rank(
    db: AsyncSession,
    user_id,
    metric: LeaderboardMetric,
    value: float,
    *,
    allowed_ids: set,
) -> int | None:
    if not allowed_ids or user_id not in allowed_ids:
        return None
    id_filter = User.id.in_(allowed_ids)
    if value <= 0 and metric != "avg_score":
        return None
    if metric == "avg_score" and value <= 0:
        cnt = await db.execute(
            select(func.count(QuizResult.id)).where(QuizResult.user_id == user_id),
        )
        if int(cnt.scalar() or 0) == 0:
            return None

    if metric == "avg_score":
        pct = _avg_score_expr()
        better = (
            select(User.id)
            .join(QuizResult, QuizResult.user_id == User.id)
            .where(User.is_banned.is_(False), id_filter)
            .group_by(User.id)
            .having(func.count(QuizResult.id) > 0, func.avg(pct) > value)
        )
    elif metric == "most_quizzes":
        better = (
            select(User.id)
            .join(QuizResult, QuizResult.user_id == User.id)
            .where(User.is_banned.is_(False), id_filter)
            .group_by(User.id)
            .having(func.count(QuizResult.id) > value)
        )
    elif metric == "cards_mastered":
        better = (
            select(User.id)
            .join(CardProgress, CardProgress.user_id == User.id)
            .where(User.is_banned.is_(False), _mastered_filter(), id_filter)
            .group_by(User.id)
            .having(func.count(CardProgress.id) > value)
        )
    else:
        better = (
            select(User.id)
            .join(QuizResult, QuizResult.user_id == User.id)
            .where(User.is_banned.is_(False), id_filter)
            .group_by(User.id)
            .having(func.coalesce(func.sum(QuizResult.score), 0) > value)
        )

    r = await db.execute(select(func.count()).select_from(better.subquery()))
    return int(r.scalar() or 0) + 1


def _format_value(metric: LeaderboardMetric, raw: float) -> float:
    if metric == "avg_score":
        return round(float(raw), 1)
    if metric in ("most_quizzes", "cards_mastered", "xp"):
        return float(int(raw))
    return float(raw)


def _row_to_item(row, *, rank: int, metric: LeaderboardMetric) -> LeaderboardItemOut:
    value = _format_value(metric, float(row.value or 0))
    name = resolve_display_name(full_name=row.full_name, email=row.email)
    return LeaderboardItemOut(
        rank=rank,
        user_id=str(row.id),
        full_name=name,
        avatar_url=row.avatar_url or None,
        value=value,
        metric=metric,
        xp=value if metric == "xp" else 0.0,
    )


@router.get("", response_model=LeaderboardPageOut)
async def get_leaderboard(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    metric: LeaderboardMetric = Query("avg_score"),
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=100),
) -> LeaderboardPageOut:
    """Leaderboard limited to users you have challenged or share a study group with."""
    size = _clamp_size(size)
    allowed_ids = await connected_user_ids(db, current_user.id)
    total = await _count_leaderboard_users(db, metric, allowed_ids=allowed_ids)
    offset = (page - 1) * size
    rows = await _fetch_leaderboard_page(
        db,
        metric,
        offset=offset,
        limit=size,
        allowed_ids=allowed_ids,
    )

    base_rank = offset + 1
    items = [_row_to_item(row, rank=base_rank + i, metric=metric) for i, row in enumerate(rows)]
    has_more = page * size < total
    tp = total_pages(total=total, size=size)
    return LeaderboardPageOut(
        items=items,
        total=total,
        page=page,
        size=size,
        has_more=has_more,
        total_pages=tp,
        metric=metric,
        metric_label=METRIC_LABELS[metric],
    )


@router.get("/me", response_model=LeaderboardMeOut)
async def get_my_leaderboard_rank(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    metric: LeaderboardMetric = Query("avg_score"),
) -> LeaderboardMeOut:
    allowed_ids = await connected_user_ids(db, current_user.id)
    value = _format_value(metric, await _user_metric_value(db, current_user.id, metric))
    rank = await _user_rank(db, current_user.id, metric, value, allowed_ids=allowed_ids)
    return LeaderboardMeOut(
        rank=rank,
        value=value,
        metric=metric,
        metric_label=METRIC_LABELS[metric],
        xp=value if metric == "xp" else 0.0,
    )
