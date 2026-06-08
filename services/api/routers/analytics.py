"""Aggregated analytics for the current user (Section 5 — server-side rollups)."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import Date, and_, case, cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import get_current_user
from models.flashcard import Flashcard, FlashcardSet
from models.quiz import CardProgress, QuizResult
from models.user import User
from schemas.analytics import (
    AnalyticsSummaryOut,
    DayActivityOut,
    RatingBreakdownOut,
    ScoreTrendDayOut,
    WeakTopicOut,
)

router = APIRouter(tags=["analytics"])


def _pct_expr():
    return 100.0 * QuizResult.score / func.nullif(QuizResult.total_questions, 0)


def _streak_from_day_set(day_set: set[date], today: date) -> int:
    count = 0
    for i in range(400):
        d = today - timedelta(days=i)
        if d in day_set:
            count += 1
        elif i > 0:
            break
    return count


@router.get("/summary", response_model=AnalyticsSummaryOut, operation_id="analytics_summary")
@router.get("/me", response_model=AnalyticsSummaryOut, operation_id="analytics_me")
async def analytics_summary(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AnalyticsSummaryOut:
    uid = current_user.id
    now = datetime.now(UTC)
    today = now.date()
    since_30 = now - timedelta(days=30)

    total_row = await db.execute(
        select(
            func.count(QuizResult.id),
            func.avg(_pct_expr()),
            func.sum(case((QuizResult.score == QuizResult.total_questions, 1), else_=0)),
        ).where(QuizResult.user_id == uid),
    )
    qc, avgp, perfect_n = total_row.one()
    quiz_count = int(qc or 0)
    avg_score = round(float(avgp or 0), 1) if quiz_count else 0.0
    has_perfect = int(perfect_n or 0) > 0

    sets_n = await db.scalar(
        select(func.count()).select_from(FlashcardSet).where(FlashcardSet.user_id == uid),
    )
    flashcard_sets_count = int(sets_n or 0)

    trend_rows = await db.execute(
        select(
            cast(QuizResult.completed_at, Date).label("day"),
            func.avg(_pct_expr()).label("avg_s"),
            func.count().label("n"),
        )
        .where(QuizResult.user_id == uid, QuizResult.completed_at >= since_30)
        .group_by(cast(QuizResult.completed_at, Date))
        .order_by(cast(QuizResult.completed_at, Date)),
    )
    trend_map: dict[date, tuple[float | None, int]] = {}
    for row in trend_rows.all():
        d = row.day
        avg_s = float(row.avg_s) if row.avg_s is not None else None
        trend_map[d] = (avg_s, int(row.n or 0))

    score_trend: list[ScoreTrendDayOut] = []
    for i in range(30):
        d = today - timedelta(days=29 - i)
        label = f"{d.strftime('%b')} {d.day}"
        avg_s, n = trend_map.get(d, (None, 0))
        score_trend.append(
            ScoreTrendDayOut(
                day=d,
                label=label,
                avg_score=round(avg_s, 1) if avg_s is not None else None,
                quiz_count=n,
            ),
        )

    wt = await db.execute(
        select(
            FlashcardSet.id,
            FlashcardSet.title,
            func.avg(_pct_expr()).label("avgp"),
        )
        .select_from(QuizResult)
        .join(FlashcardSet, FlashcardSet.id == QuizResult.set_id)
        .where(QuizResult.user_id == uid)
        .group_by(FlashcardSet.id, FlashcardSet.title)
        .order_by(func.avg(_pct_expr()).asc())
        .limit(8),
    )
    weak_topics: list[WeakTopicOut] = []
    for tid, title, avgp in wt.all():
        if avgp is None:
            continue
        weak_topics.append(
            WeakTopicOut(set_id=str(tid), title=title, avg_score=round(float(avgp), 1)),
        )

    easy_cond = or_(
        CardProgress.repetitions >= 3,
        and_(CardProgress.repetitions >= 1, CardProgress.ease_factor >= 2.5),
    )
    hard_cond = or_(
        CardProgress.ease_factor < 2.0,
        and_(
            CardProgress.repetitions == 0,
            CardProgress.times_incorrect > CardProgress.times_correct,
        ),
    )
    band = case((easy_cond, "easy"), (hard_cond, "hard"), else_="medium")
    rb = await db.execute(
        select(band, func.count())
        .select_from(CardProgress)
        .join(Flashcard, Flashcard.id == CardProgress.card_id)
        .join(FlashcardSet, FlashcardSet.id == Flashcard.set_id)
        .where(FlashcardSet.user_id == uid)
        .group_by(band),
    )
    counts = {"easy": 0, "medium": 0, "hard": 0}
    for b, c in rb.all():
        if b in counts:
            counts[str(b)] = int(c or 0)
    cards_mastered_easy_band = counts["easy"]
    rating_breakdown = RatingBreakdownOut(easy=counts["easy"], medium=counts["medium"], hard=counts["hard"])

    dates_result = await db.scalars(
        select(cast(QuizResult.completed_at, Date))
        .where(
            QuizResult.user_id == uid,
            QuizResult.completed_at >= now - timedelta(days=400),
        )
        .distinct(),
    )
    day_set = set(dates_result.all())
    streak_days = _streak_from_day_set(day_set, today)

    last_14_days: list[DayActivityOut] = []
    for i in range(14):
        d = today - timedelta(days=13 - i)
        last_14_days.append(DayActivityOut(day=d, had_quiz=d in day_set))

    return AnalyticsSummaryOut(
        quiz_count=quiz_count,
        avg_score=avg_score,
        cards_mastered_easy_band=cards_mastered_easy_band,
        flashcard_sets_count=flashcard_sets_count,
        has_perfect_quiz=has_perfect,
        score_trend=score_trend,
        weak_topics=weak_topics,
        rating_breakdown=rating_breakdown,
        streak_days=streak_days,
        last_14_days=last_14_days,
    )
