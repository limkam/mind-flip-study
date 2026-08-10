"""Leaderboard V2 Router — Server-Validated Dynamic Rankings.

Supports Global/Connections scopes, Weekly/All-Time periods, multiple metrics,
Around-You ranking slices, and exact overtake calculations via SQL Window Functions.
"""

from __future__ import annotations

from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import case, func, select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import get_current_user
from models.enums import UserRole
from models.quiz import CardProgress, QuizResult
from models.user import User
from models.xp import XPTransaction
from schemas.pagination import total_pages
from services.connected_users import connected_user_ids
from services.xp_service import get_current_utc_week_bounds
from user_identity import resolve_display_name

router = APIRouter(tags=["leaderboard-v2"])

LeaderboardScope = Literal["global", "connections", "friends"]
LeaderboardPeriod = Literal["weekly", "all_time"]
LeaderboardMetric = Literal["xp", "avg_score", "most_quizzes", "cards_mastered"]

METRIC_LABELS: dict[LeaderboardMetric, str] = {
    "xp": "Total XP",
    "avg_score": "Average Score",
    "most_quizzes": "Quizzes Completed",
    "cards_mastered": "Cards Mastered",
}


class LeaderboardItemOut(BaseModel):
    rank: int
    user_id: str
    full_name: str
    avatar_url: str | None = None
    value: float
    metric: str
    xp: float
    is_current_user: bool = False


class LeaderboardMeOut(BaseModel):
    rank: int | None = None
    value: float = 0.0
    metric: str
    metric_label: str
    xp: float = 0.0
    xp_to_next_rank: float = 0.0
    next_user_rank: int | None = None


class LeaderboardPageOut(BaseModel):
    items: list[LeaderboardItemOut]
    me: LeaderboardMeOut
    around_me: list[LeaderboardItemOut]
    total: int
    page: int
    size: int
    has_more: bool
    total_pages: int
    period: str
    scope: str
    metric: str
    metric_label: str


def _clamp_size(size: int) -> int:
    return max(1, min(size, 100))


def _normalize_scope(scope: LeaderboardScope) -> str:
    return "connections" if scope in ("connections", "friends") else "global"


async def _get_eligible_user_ids(
    db: AsyncSession,
    scope: str,
    current_user_id: Any,
) -> set | None:
    """Return set of allowed user IDs for connections scope, or None for global scope."""
    if scope == "connections":
        allowed = await connected_user_ids(db, current_user_id)
        return allowed
    return None


def _build_ranked_subquery(
    period: LeaderboardPeriod,
    metric: LeaderboardMetric,
    allowed_ids: set | None = None,
):
    """Construct SQL subquery with ROW_NUMBER() OVER (...) for deterministic database ranking."""
    banned_filter = and_(User.is_banned.is_(False), User.role != UserRole.admin)

    if allowed_ids is not None:
        if not allowed_ids:
            id_filter = User.id.in_([])
        else:
            id_filter = User.id.in_(allowed_ids)
    else:
        id_filter = True

    if metric == "xp":
        if period == "weekly":
            w_start, w_end = get_current_utc_week_bounds()
            time_filter = and_(XPTransaction.created_at >= w_start, XPTransaction.created_at < w_end)
        else:
            time_filter = True

        join_clause = User.id == XPTransaction.user_id
        if time_filter is not True:
            join_clause = and_(join_clause, time_filter)

        base_stmt = (
            select(
                User.id.label("user_id"),
                User.full_name.label("full_name"),
                User.email.label("email"),
                User.avatar_url.label("avatar_url"),
                func.coalesce(func.sum(XPTransaction.amount), 0).label("value"),
                func.max(XPTransaction.created_at).label("last_activity"),
            )
            .outerjoin(XPTransaction, join_clause)
            .where(banned_filter, id_filter)
            .group_by(User.id, User.full_name, User.email, User.avatar_url)
        )
    elif metric == "avg_score":
        pct = case(
            (QuizResult.total_questions > 0, QuizResult.score * 100.0 / QuizResult.total_questions),
            else_=0.0,
        )
        base_stmt = (
            select(
                User.id.label("user_id"),
                User.full_name.label("full_name"),
                User.email.label("email"),
                User.avatar_url.label("avatar_url"),
                func.coalesce(func.avg(pct), 0.0).label("value"),
                func.max(QuizResult.completed_at).label("last_activity"),
            )
            .outerjoin(QuizResult, QuizResult.user_id == User.id)
            .where(banned_filter, id_filter)
            .group_by(User.id, User.full_name, User.email, User.avatar_url)
        )
    elif metric == "most_quizzes":
        base_stmt = (
            select(
                User.id.label("user_id"),
                User.full_name.label("full_name"),
                User.email.label("email"),
                User.avatar_url.label("avatar_url"),
                func.count(QuizResult.id).label("value"),
                func.max(QuizResult.completed_at).label("last_activity"),
            )
            .outerjoin(QuizResult, QuizResult.user_id == User.id)
            .where(banned_filter, id_filter)
            .group_by(User.id, User.full_name, User.email, User.avatar_url)
        )
    else:  # cards_mastered
        mastered_filter = or_(
            CardProgress.repetitions >= 3,
            and_(CardProgress.repetitions >= 1, CardProgress.ease_factor >= 2.5),
        )
        base_stmt = (
            select(
                User.id.label("user_id"),
                User.full_name.label("full_name"),
                User.email.label("email"),
                User.avatar_url.label("avatar_url"),
                func.count(CardProgress.id).label("value"),
                func.max(CardProgress.last_reviewed_at).label("last_activity"),
            )
            .outerjoin(CardProgress, and_(CardProgress.user_id == User.id, mastered_filter))
            .where(banned_filter, id_filter)
            .group_by(User.id, User.full_name, User.email, User.avatar_url)
        )

    sub = base_stmt.subquery("sub")
    rank_col = func.row_number().over(
        order_by=[
            sub.c.value.desc(),
            sub.c.last_activity.asc().nullslast(),
            sub.c.user_id.asc(),
        ]
    ).label("rank")

    return select(
        sub.c.user_id,
        sub.c.full_name,
        sub.c.email,
        sub.c.avatar_url,
        sub.c.value,
        sub.c.last_activity,
        rank_col,
    ).subquery("ranked")


@router.get("", response_model=LeaderboardPageOut)
async def get_leaderboard(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    scope: LeaderboardScope = Query("global"),
    period: LeaderboardPeriod = Query("weekly"),
    metric: LeaderboardMetric = Query("xp"),
    page: int = Query(1, ge=1),
    size: int = Query(25, ge=1, le=100),
) -> LeaderboardPageOut:
    norm_scope = _normalize_scope(scope)
    size = _clamp_size(size)
    allowed_ids = await _get_eligible_user_ids(db, norm_scope, current_user.id)

    if allowed_ids is not None and not allowed_ids:
        # Empty connections set
        me_out = LeaderboardMeOut(
            rank=None,
            value=0.0,
            metric=metric,
            metric_label=METRIC_LABELS[metric],
            xp=0.0,
            xp_to_next_rank=0.0,
            next_user_rank=None,
        )
        return LeaderboardPageOut(
            items=[],
            me=me_out,
            around_me=[],
            total=0,
            page=page,
            size=size,
            has_more=False,
            total_pages=0,
            period=period,
            scope=norm_scope,
            metric=metric,
            metric_label=METRIC_LABELS[metric],
        )

    ranked_cte = _build_ranked_subquery(period, metric, allowed_ids)

    # 1. Total Count
    total = int(await db.scalar(select(func.count()).select_from(ranked_cte)) or 0)
    current_user_id = current_user.id
    current_user_str = str(current_user_id)

    # 2. Current User Standing
    my_row = (
        await db.execute(select(ranked_cte).where(ranked_cte.c.user_id == current_user_id))
    ).first()

    if my_row:
        user_rank = int(my_row.rank)
        user_val = float(my_row.value or 0)
        user_xp = user_val if metric == "xp" else 0.0

        if user_rank > 1:
            above_row = (
                await db.execute(select(ranked_cte).where(ranked_cte.c.rank == user_rank - 1))
            ).first()
            if above_row:
                above_val = float(above_row.value or 0)
                next_user_rank = int(above_row.rank)
                if above_val > user_val:
                    xp_to_next = (above_val - user_val) + 1.0 if metric == "xp" else (above_val - user_val)
                else:
                    xp_to_next = 1.0 if metric == "xp" else 0.1
            else:
                xp_to_next = 0.0
                next_user_rank = None
        else:
            xp_to_next = 0.0
            next_user_rank = None
    else:
        user_rank = None
        user_val = 0.0
        user_xp = 0.0
        xp_to_next = 0.0
        next_user_rank = None

    me_out = LeaderboardMeOut(
        rank=user_rank,
        value=user_val,
        metric=metric,
        metric_label=METRIC_LABELS[metric],
        xp=user_xp,
        xp_to_next_rank=xp_to_next,
        next_user_rank=next_user_rank,
    )

    # 3. Top Slice Query (Top 25 or requested page slice)
    offset = 0 if norm_scope == "global" and page == 1 else (page - 1) * size
    fetch_size = 25 if norm_scope == "global" and page == 1 else size

    top_rows = (
        await db.execute(
            select(ranked_cte)
            .order_by(ranked_cte.c.rank.asc())
            .offset(offset)
            .limit(fetch_size)
        )
    ).all()

    top_items = [
        LeaderboardItemOut(
            rank=int(r.rank),
            user_id=str(r.user_id),
            full_name=resolve_display_name(full_name=r.full_name, email=r.email),
            avatar_url=r.avatar_url,
            value=float(r.value or 0),
            metric=metric,
            xp=float(r.value or 0) if metric == "xp" else 0.0,
            is_current_user=(str(r.user_id) == current_user_str),
        )
        for r in top_rows
    ]

    # 4. Around You Section (~5 above, current user, ~5 below)
    around_items: list[LeaderboardItemOut] = []
    if user_rank is not None:
        start_rank = max(1, user_rank - 5)
        end_rank = user_rank + 5
        around_rows = (
            await db.execute(
                select(ranked_cte)
                .where(ranked_cte.c.rank >= start_rank, ranked_cte.c.rank <= end_rank)
                .order_by(ranked_cte.c.rank.asc())
            )
        ).all()

        around_items = [
            LeaderboardItemOut(
                rank=int(r.rank),
                user_id=str(r.user_id),
                full_name=resolve_display_name(full_name=r.full_name, email=r.email),
                avatar_url=r.avatar_url,
                value=float(r.value or 0),
                metric=metric,
                xp=float(r.value or 0) if metric == "xp" else 0.0,
                is_current_user=(str(r.user_id) == current_user_str),
            )
            for r in around_rows
        ]

    has_more = page * size < total
    tp = total_pages(total=total, size=size)

    return LeaderboardPageOut(
        items=top_items,
        me=me_out,
        around_me=around_items,
        total=total,
        page=page,
        size=size,
        has_more=has_more,
        total_pages=tp,
        period=period,
        scope=norm_scope,
        metric=metric,
        metric_label=METRIC_LABELS[metric],
    )


@router.get("/me", response_model=LeaderboardMeOut)
async def get_my_leaderboard_rank(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    scope: LeaderboardScope = Query("global"),
    period: LeaderboardPeriod = Query("weekly"),
    metric: LeaderboardMetric = Query("xp"),
) -> LeaderboardMeOut:
    norm_scope = _normalize_scope(scope)
    allowed_ids = await _get_eligible_user_ids(db, norm_scope, current_user.id)

    if allowed_ids is not None and not allowed_ids:
        return LeaderboardMeOut(
            rank=None,
            value=0.0,
            metric=metric,
            metric_label=METRIC_LABELS[metric],
            xp=0.0,
            xp_to_next_rank=0.0,
            next_user_rank=None,
        )

    ranked_cte = _build_ranked_subquery(period, metric, allowed_ids)
    current_user_id = current_user.id

    my_row = (
        await db.execute(select(ranked_cte).where(ranked_cte.c.user_id == current_user_id))
    ).first()

    if my_row:
        user_rank = int(my_row.rank)
        user_val = float(my_row.value or 0)
        user_xp = user_val if metric == "xp" else 0.0

        if user_rank > 1:
            above_row = (
                await db.execute(select(ranked_cte).where(ranked_cte.c.rank == user_rank - 1))
            ).first()
            if above_row:
                above_val = float(above_row.value or 0)
                next_user_rank = int(above_row.rank)
                if above_val > user_val:
                    xp_to_next = (above_val - user_val) + 1.0 if metric == "xp" else (above_val - user_val)
                else:
                    xp_to_next = 1.0 if metric == "xp" else 0.1
            else:
                xp_to_next = 0.0
                next_user_rank = None
        else:
            xp_to_next = 0.0
            next_user_rank = None
    else:
        user_rank = None
        user_val = 0.0
        user_xp = 0.0
        xp_to_next = 0.0
        next_user_rank = None

    return LeaderboardMeOut(
        rank=user_rank,
        value=user_val,
        metric=metric,
        metric_label=METRIC_LABELS[metric],
        xp=user_xp,
        xp_to_next_rank=xp_to_next,
        next_user_rank=next_user_rank,
    )
