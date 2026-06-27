"""Server-side achievement evaluation and sync from real user activity."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from typing import Any, Callable
from uuid import UUID

from sqlalchemy import Date, case, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from models.achievement import Achievement
from models.flashcard import Flashcard, FlashcardSet
from models.quiz import QuizChallenge, QuizResult


@dataclass(frozen=True)
class AchievementDef:
    achievement_type: str
    title: str
    description: str
    icon: str
    check: Callable[[dict[str, Any]], bool]


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


ACHIEVEMENT_DEFS: list[AchievementDef] = [
    AchievementDef("first_quiz", "First Quiz", "Complete your first quiz", "🎯", lambda s: s["quiz_count"] >= 1),
    AchievementDef("quiz_5", "On a Roll", "Complete 5 quizzes", "🔥", lambda s: s["quiz_count"] >= 5),
    AchievementDef("quiz_20", "Quiz Master", "Complete 20 quizzes", "🏅", lambda s: s["quiz_count"] >= 20),
    AchievementDef("perfect_score", "Perfect Score", "Score 100% on a quiz", "💯", lambda s: s["has_perfect"]),
    AchievementDef("streak_3", "3-Day Streak", "Study 3 days in a row", "⚡", lambda s: s["streak"] >= 3),
    AchievementDef("streak_7", "Week Warrior", "Study 7 days in a row", "🔥", lambda s: s["streak"] >= 7),
    AchievementDef("streak_30", "Legend", "Study 30 days in a row", "🏆", lambda s: s["streak"] >= 30),
    AchievementDef("cards_100", "Card Collector", "Create 100+ flashcards total", "📚", lambda s: s["total_cards"] >= 100),
    AchievementDef("cards_500", "Knowledge Vault", "Create 500+ flashcards", "🌟", lambda s: s["total_cards"] >= 500),
    AchievementDef("first_challenge", "Challenger", "Send your first quiz challenge", "⚔️", lambda s: s["challenges_sent"] >= 1),
]


async def compute_achievement_stats(db: AsyncSession, user_id: UUID) -> dict[str, Any]:
    now = datetime.now(UTC)
    today = now.date()

    total_row = await db.execute(
        select(
            func.count(QuizResult.id),
            func.sum(case((QuizResult.score == QuizResult.total_questions, 1), else_=0)),
        ).where(QuizResult.user_id == user_id),
    )
    qc, perfect_n = total_row.one()
    quiz_count = int(qc or 0)
    has_perfect = int(perfect_n or 0) > 0

    cards_n = await db.scalar(
        select(func.count())
        .select_from(Flashcard)
        .join(FlashcardSet, Flashcard.set_id == FlashcardSet.id)
        .where(FlashcardSet.user_id == user_id),
    )
    total_cards = int(cards_n or 0)

    challenges_sent = int(
        await db.scalar(
            select(func.count()).select_from(QuizChallenge).where(QuizChallenge.challenger_id == user_id),
        )
        or 0,
    )

    dates_result = await db.scalars(
        select(cast(QuizResult.completed_at, Date))
        .where(
            QuizResult.user_id == user_id,
            QuizResult.completed_at >= now - timedelta(days=400),
        )
        .distinct(),
    )
    streak = _streak_from_day_set(set(dates_result.all()), today)

    return {
        "quiz_count": quiz_count,
        "has_perfect": has_perfect,
        "streak": streak,
        "total_cards": total_cards,
        "challenges_sent": challenges_sent,
    }


async def sync_user_achievements(db: AsyncSession, user_id: UUID) -> None:
    """Award any achievements the user has earned but not yet stored."""
    stats = await compute_achievement_stats(db, user_id)

    existing_r = await db.execute(
        select(Achievement.achievement_type).where(Achievement.user_id == user_id),
    )
    existing = set(existing_r.scalars().all())

    created = False
    for ach in ACHIEVEMENT_DEFS:
        if ach.achievement_type in existing:
            continue
        if not ach.check(stats):
            continue
        db.add(
            Achievement(
                user_id=user_id,
                achievement_type=ach.achievement_type,
                metadata_={
                    "title": ach.title,
                    "description": ach.description,
                    "icon": ach.icon,
                },
            ),
        )
        existing.add(ach.achievement_type)
        created = True

    if created:
        await db.commit()
