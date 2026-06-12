"""Challenge leaderboard — competition rankings and badges."""

from __future__ import annotations

from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import get_current_user
from models.achievement import Achievement
from models.enums import QuizChallengeStatus
from models.book import Book
from models.flashcard import FlashcardSet
from models.quiz import QuizChallenge, QuizResult
from models.user import User
from schemas.pagination import total_pages
from user_identity import resolve_display_name

router = APIRouter(tags=["challenge-leaderboard"])

ChallengeTab = Literal["overall", "by_content"]


class ChallengeLeaderboardItem(BaseModel):
    rank: int
    user_id: str
    full_name: str
    avatar_url: str | None = None
    points: float
    accuracy: float
    activity: int
    wins: int


class ChallengeLeaderboardPage(BaseModel):
    items: list[ChallengeLeaderboardItem]
    total: int
    page: int
    size: int
    has_more: bool
    total_pages: int


class ContentLeaderboardItem(BaseModel):
    rank: int
    user_id: str
    full_name: str
    content_key: str
    content_label: str
    points: float
    accuracy: float
    quiz_count: int


class BadgeOut(BaseModel):
    id: str
    achievement_type: str
    title: str
    description: str
    icon: str
    earned_at: str
    category: str


def _avg_score_expr():
    return case(
        (QuizResult.total_questions > 0, QuizResult.score * 100.0 / QuizResult.total_questions),
        else_=0.0,
    )


def _badge_category(achievement_type: str) -> str:
    if achievement_type.startswith("streak"):
        return "streak"
    if "challenge" in achievement_type or achievement_type == "first_challenge":
        return "completion"
    if achievement_type in ("perfect_score",):
        return "accuracy"
    if achievement_type.startswith("cards") or achievement_type.startswith("quiz"):
        return "mastery"
    return "completion"


@router.get("/overall", response_model=ChallengeLeaderboardPage)
async def challenge_leaderboard_overall(
    db: Annotated[AsyncSession, Depends(get_db)],
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=100),
) -> ChallengeLeaderboardPage:
    """Global challenge ranking: points from wins, accuracy, and quiz activity."""
    size = max(1, min(size, 100))
    offset = (page - 1) * size

    pct = _avg_score_expr()
    quiz_stats = (
        select(
            User.id.label("user_id"),
            func.count(QuizResult.id).label("quiz_count"),
            func.avg(pct).label("avg_accuracy"),
        )
        .join(QuizResult, QuizResult.user_id == User.id)
        .where(User.is_banned.is_(False))
        .group_by(User.id)
        .subquery()
    )

    all_challenges = (
        await db.execute(select(QuizChallenge).where(QuizChallenge.status == QuizChallengeStatus.completed))
    ).scalars().all()
    wins_by_user: dict[str, int] = {}
    for ch in all_challenges:
        rd = ch.result_data or {}
        winner_email = (rd.get("winner_email") or "").strip().lower()
        if not winner_email:
            continue
        if winner_email == (rd.get("challenger_email") or "").strip().lower():
            uid = str(ch.challenger_id)
        elif winner_email == (rd.get("opponent_email") or "").strip().lower():
            uid = str(ch.challengee_id)
        else:
            continue
        wins_by_user[uid] = wins_by_user.get(uid, 0) + 1

    stmt = (
        select(
            User.id,
            User.full_name,
            User.email,
            User.avatar_url,
            func.coalesce(quiz_stats.c.quiz_count, 0).label("activity"),
            func.coalesce(quiz_stats.c.avg_accuracy, 0).label("accuracy"),
        )
        .outerjoin(quiz_stats, quiz_stats.c.user_id == User.id)
        .where(User.is_banned.is_(False))
    )
    rows = (await db.execute(stmt)).all()

    scored: list[tuple] = []
    for row in rows:
        uid = str(row.id)
        wins = wins_by_user.get(uid, 0)
        activity = int(row.activity or 0)
        accuracy = float(row.accuracy or 0)
        if wins == 0 and activity == 0:
            continue
        points = wins * 10 + activity * 2 + accuracy * 0.5
        scored.append((row, points, accuracy, activity, wins))

    scored.sort(key=lambda x: (-x[1], -x[4], -x[3]))
    total = len(scored)
    page_rows = scored[offset : offset + size]

    items = [
        ChallengeLeaderboardItem(
            rank=offset + i + 1,
            user_id=str(row.id),
            full_name=resolve_display_name(full_name=row.full_name, email=row.email),
            avatar_url=row.avatar_url,
            points=round(points, 1),
            accuracy=round(accuracy, 1),
            activity=activity,
            wins=wins,
        )
        for i, (row, points, accuracy, activity, wins) in enumerate(page_rows)
    ]

    return ChallengeLeaderboardPage(
        items=items,
        total=total,
        page=page,
        size=size,
        has_more=page * size < total,
        total_pages=total_pages(total=total, size=size),
    )


@router.get("/by-content", response_model=list[ContentLeaderboardItem])
async def challenge_leaderboard_by_content(
    db: Annotated[AsyncSession, Depends(get_db)],
    book_title: str | None = Query(None),
    set_id: str | None = Query(None),
    limit: int = Query(20, ge=1, le=50),
) -> list[ContentLeaderboardItem]:
    """Per-book or per-flashcard-set rankings."""
    pct = _avg_score_expr()
    stmt = (
        select(
            User.id,
            User.full_name,
            User.email,
            QuizResult.set_id,
            func.count(QuizResult.id).label("quiz_count"),
            func.avg(pct).label("avg_accuracy"),
            func.coalesce(func.sum(QuizResult.score), 0).label("total_score"),
        )
        .join(QuizResult, QuizResult.user_id == User.id)
        .where(User.is_banned.is_(False))
        .group_by(User.id, User.full_name, User.email, QuizResult.set_id)
        .having(func.count(QuizResult.id) > 0)
    )
    if set_id:
        from uuid import UUID as PyUUID

        stmt = stmt.where(QuizResult.set_id == PyUUID(set_id))

    rows = (await db.execute(stmt)).all()
    set_ids = {row.set_id for row in rows}
    set_map: dict = {}
    book_map: dict = {}
    if set_ids:
        fs_rows = (await db.execute(select(FlashcardSet).where(FlashcardSet.id.in_(set_ids)))).scalars().all()
        set_map = {fs.id: fs for fs in fs_rows}
        book_ids = {fs.book_id for fs in fs_rows if fs.book_id}
        if book_ids:
            book_rows = (await db.execute(select(Book).where(Book.id.in_(book_ids)))).scalars().all()
            book_map = {b.id: b.title for b in book_rows}

    grouped: dict[str, list] = {}
    for row in rows:
        fs = set_map.get(row.set_id)
        label = (fs.title if fs else "Unknown set") or "Unknown set"
        book = book_map.get(fs.book_id) if fs and fs.book_id else ""
        if book_title and book and book_title.lower() not in book.lower():
            continue
        key = book or label
        grouped.setdefault(key, []).append(row)

    results: list[ContentLeaderboardItem] = []
    for content_key, members in grouped.items():
        members_sorted = sorted(
            members,
            key=lambda r: (-float(r.total_score or 0), -float(r.avg_accuracy or 0)),
        )[:limit]
        for rank, row in enumerate(members_sorted, start=1):
            fs = set_map.get(row.set_id)
            label = (fs.title if fs else content_key) or content_key
            quiz_count = int(row.quiz_count or 0)
            accuracy = float(row.avg_accuracy or 0)
            points = quiz_count * 2 + accuracy * 0.5
            results.append(
                ContentLeaderboardItem(
                    rank=rank,
                    user_id=str(row.id),
                    full_name=resolve_display_name(full_name=row.full_name, email=row.email),
                    content_key=content_key,
                    content_label=label,
                    points=round(points, 1),
                    accuracy=round(accuracy, 1),
                    quiz_count=quiz_count,
                ),
            )

    results.sort(key=lambda x: (-x.points, -x.accuracy))
    return results[:limit]


@router.get("/badges", response_model=list[BadgeOut])
async def my_challenge_badges(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[BadgeOut]:
    r = await db.execute(
        select(Achievement)
        .where(Achievement.user_id == current_user.id)
        .order_by(Achievement.earned_at.desc()),
    )
    rows = r.scalars().all()
    out: list[BadgeOut] = []
    for a in rows:
        meta = dict(a.metadata_ or {})
        out.append(
            BadgeOut(
                id=str(a.id),
                achievement_type=a.achievement_type,
                title=str(meta.get("title") or a.achievement_type.replace("_", " ").title()),
                description=str(meta.get("description") or ""),
                icon=str(meta.get("icon") or "🏅"),
                earned_at=a.earned_at.isoformat() if a.earned_at else "",
                category=_badge_category(a.achievement_type),
            ),
        )
    return out
