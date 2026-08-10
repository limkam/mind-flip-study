"""Automatic, persisted, versioned learning scorecards."""

from __future__ import annotations

from datetime import UTC, date, datetime, time, timedelta
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from models.engagement import LearningStreak, Scorecard
from models.book import Book
from models.flashcard import FlashcardSet
from models.quiz import QuizResult, StudyEvent

FORMULA_VERSION = "v2"
COMPONENT_WEIGHTS = {"accuracy": 40, "consistency": 30, "activity": 20, "healthy_time": 10}
METRIC_EXPLANATIONS = {
    "accuracy": "Average assessment accuracy, capped between 0 and 100%.",
    "consistency": "Share of available days with recorded learning activity.",
    "activity": "Completed assessments relative to a healthy period target.",
    "healthy_time": "Recorded assessment time, capped so long sessions cannot dominate.",
}


def period_bounds(period_type: str, today: date) -> tuple[date, date]:
    if period_type == "weekly":
        return today - timedelta(days=today.weekday()), today
    if period_type == "monthly":
        return today.replace(day=1), today
    raise ValueError(f"Unsupported period type: {period_type}")


def previous_bounds(period_type: str, start: date) -> tuple[date, date]:
    if period_type == "weekly":
        return start - timedelta(days=7), start - timedelta(days=1)
    if period_type == "monthly":
        end = start - timedelta(days=1)
        return end.replace(day=1), end
    raise ValueError(f"Unsupported period type: {period_type}")


def component_scores(*, assessments: int, average_score: float | None, learning_minutes: int, active_days: int, available_days: int = 7) -> dict[str, int]:
    available = max(1, available_days)
    targets = {"assessments": max(1, round(5 * available / 7)), "minutes": max(1, round(150 * available / 7))}
    return {
        "accuracy": round(100 * max(0.0, min(100.0, average_score or 0.0)) / 100),
        "consistency": round(100 * max(0, min(available, active_days)) / available),
        "activity": round(100 * max(0, min(targets["assessments"], assessments)) / targets["assessments"]),
        "healthy_time": round(100 * max(0, min(targets["minutes"], learning_minutes)) / targets["minutes"]),
    }


def calculate_score(*, assessments: int, average_score: float | None, learning_minutes: int, active_days: int, available_days: int = 7) -> int:
    components = component_scores(assessments=assessments, average_score=average_score, learning_minutes=learning_minutes, active_days=active_days, available_days=available_days)
    return round(sum(components[key] * weight / 100 for key, weight in COMPONENT_WEIGHTS.items()))


def data_state(metrics: dict) -> str:
    if not metrics.get("cards_reviewed") and not metrics.get("assessments_completed"):
        return "empty"
    if not metrics.get("assessments_completed") or metrics.get("average_assessment_score") is None:
        return "partial"
    return "complete"


def comparison(current: dict, previous: dict | None) -> dict | None:
    if previous is None or previous.get("data_state") == "empty":
        return None
    score_delta = int(current.get("score", 0)) - int(previous.get("score", 0))
    deltas = {key: int(current["component_scores"].get(key, 0)) - int(previous["component_scores"].get(key, 0)) for key in COMPONENT_WEIGHTS}
    improved = max(deltas, key=deltas.get) if max(deltas.values(), default=0) > 0 else None
    return {"score_delta": score_delta, "direction": "up" if score_delta > 0 else "down" if score_delta < 0 else "flat", "component_deltas": deltas, "most_improved_skill": improved}


def is_personal_best(score: int, previous_best: int | None) -> bool:
    return previous_best is None or score > previous_best


async def calculate_period_metrics(db: AsyncSession, user_id: UUID, start: date, end: date, *, set_ids: list[UUID] | None = None) -> tuple[dict, int]:
    start_at, end_at = datetime.combine(start, time.min, tzinfo=UTC), datetime.combine(end, time.max, tzinfo=UTC)
    quiz_stmt = select(func.count(QuizResult.id), func.avg(100.0 * QuizResult.score / func.nullif(QuizResult.total_questions, 0)), func.coalesce(func.sum(QuizResult.time_taken_seconds), 0)).where(QuizResult.user_id == user_id, QuizResult.completed_at >= start_at, QuizResult.completed_at <= end_at)
    study_stmt = select(func.count(StudyEvent.id), func.count(func.distinct(func.date(StudyEvent.created_at)))).where(StudyEvent.user_id == user_id, StudyEvent.created_at >= start_at, StudyEvent.created_at <= end_at)
    if set_ids is not None:
        if not set_ids:
            quiz_row, study_row = (0, None, 0), (0, 0)
        else:
            quiz_row = (await db.execute(quiz_stmt.where(QuizResult.set_id.in_(set_ids)))).one()
            study_row = (await db.execute(study_stmt.where(StudyEvent.set_id.in_(set_ids)))).one()
    else:
        quiz_row, study_row = (await db.execute(quiz_stmt)).one(), (await db.execute(study_stmt)).one()
    assessments, avg_score, quiz_seconds = int(quiz_row[0] or 0), float(quiz_row[1]) if quiz_row[1] is not None else None, int(quiz_row[2] or 0)
    reviews, active_days = int(study_row[0] or 0), int(study_row[1] or 0)
    streak = await db.get(LearningStreak, user_id)
    available_days = max(1, (end - start).days + 1)
    components = component_scores(assessments=assessments, average_score=avg_score, learning_minutes=round(quiz_seconds / 60), active_days=active_days, available_days=available_days)
    score = round(sum(components[key] * weight / 100 for key, weight in COMPONENT_WEIGHTS.items()))
    metrics = {"assessments_completed": assessments, "average_assessment_score": round(avg_score, 1) if avg_score is not None else None, "learning_minutes": round(quiz_seconds / 60), "cards_reviewed": reviews, "active_days": active_days, "current_streak": streak.current_streak if streak else 0, "longest_streak": streak.longest_streak if streak else 0, "available_days": available_days, "component_scores": components, "component_weights": COMPONENT_WEIGHTS, "metric_explanations": METRIC_EXPLANATIONS}
    metrics["data_state"] = data_state(metrics)
    return metrics, score


async def upsert_scorecard(db: AsyncSession, user_id: UUID, period_type: str, start: date, end: date, *, entity_id: str = "", set_ids: list[UUID] | None = None) -> Scorecard:
    metrics, score = await calculate_period_metrics(db, user_id, start, end, set_ids=set_ids)
    previous = None
    if period_type in {"weekly", "monthly"}:
        previous_start, previous_end = previous_bounds(period_type, start)
        previous_metrics, previous_score = await calculate_period_metrics(db, user_id, previous_start, previous_end)
        previous = {**previous_metrics, "score": previous_score, "period_start": previous_start.isoformat(), "period_end": previous_end.isoformat()}
    metrics["comparison"] = comparison({**metrics, "score": score}, previous)
    metrics["previous_period"] = previous
    best = await db.scalar(select(func.max(Scorecard.score)).where(Scorecard.user_id == user_id, Scorecard.period_type == period_type, Scorecard.entity_id == entity_id))
    metrics["personal_best"] = is_personal_best(score, int(best) if best is not None else None)
    identity = [Scorecard.user_id == user_id, Scorecard.period_type == period_type, Scorecard.entity_id == entity_id, Scorecard.period_start == start]
    row = await db.scalar(select(Scorecard).where(*identity))
    if row is None:
        row = Scorecard(user_id=user_id, period_type=period_type, entity_id=entity_id, period_start=start, period_end=end, score=score, formula_version=FORMULA_VERSION, metrics=metrics)
        db.add(row)
    else:
        row.period_end, row.score, row.formula_version, row.metrics = end, score, FORMULA_VERSION, metrics
    await db.flush()
    return row


async def refresh_current_scorecards(db: AsyncSession, user_id: UUID, *, affected_set_id: UUID | None = None, today: date | None = None) -> list[Scorecard]:
    current = today or datetime.now(UTC).date()
    rows = []
    for kind in ("weekly", "monthly"):
        start, end = period_bounds(kind, current)
        rows.append(await upsert_scorecard(db, user_id, kind, start, end))
    course_stmt = select(FlashcardSet.book_id).where(FlashcardSet.user_id == user_id, FlashcardSet.book_id.is_not(None))
    if affected_set_id:
        course_stmt = course_stmt.where(FlashcardSet.id == affected_set_id)
    book_ids = list((await db.scalars(course_stmt.distinct())).all())
    for book_id in book_ids:
        set_ids = list((await db.scalars(select(FlashcardSet.id).where(FlashcardSet.user_id == user_id, FlashcardSet.book_id == book_id))).all())
        first_study = await db.scalar(select(func.min(StudyEvent.created_at)).where(StudyEvent.user_id == user_id, StudyEvent.set_id.in_(set_ids))) if set_ids else None
        first_quiz = await db.scalar(select(func.min(QuizResult.completed_at)).where(QuizResult.user_id == user_id, QuizResult.set_id.in_(set_ids))) if set_ids else None
        first = min(value for value in (first_study, first_quiz) if value is not None) if first_study or first_quiz else None
        start = first.date() if first else current
        row = await upsert_scorecard(db, user_id, "course", start, current, entity_id=str(book_id), set_ids=set_ids)
        book = await db.get(Book, book_id)
        row.metrics = {**row.metrics, "course_title": book.title if book else "Course"}
        rows.append(row)
    await db.commit()
    for row in rows:
        await db.refresh(row)
    return rows
