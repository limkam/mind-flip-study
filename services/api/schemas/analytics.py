from __future__ import annotations

from datetime import date

from pydantic import BaseModel, Field


class ScoreTrendDayOut(BaseModel):
    """One calendar day in the trend window."""

    day: date
    label: str = Field(description="Short label for charts, e.g. Jan 5")
    avg_score: float | None = Field(None, description="Mean quiz percentage that day, null if no quizzes")
    quiz_count: int = Field(0, ge=0)


class WeakTopicOut(BaseModel):
    set_id: str
    title: str
    avg_score: float


class RatingBreakdownOut(BaseModel):
    """Heuristic buckets from SM-2 card_progress (ease / repetitions / times)."""

    easy: int = Field(0, ge=0)
    medium: int = Field(0, ge=0)
    hard: int = Field(0, ge=0)


class DayActivityOut(BaseModel):
    day: date
    had_quiz: bool


class AnalyticsSummaryOut(BaseModel):
    quiz_count: int = Field(0, ge=0)
    avg_score: float = Field(0, ge=0, le=100)
    cards_mastered_easy_band: int = Field(0, ge=0, description="Cards in the easy mastery band (SM-2 heuristic)")
    flashcard_sets_count: int = Field(0, ge=0)
    has_perfect_quiz: bool = False
    score_trend: list[ScoreTrendDayOut] = Field(default_factory=list)
    weak_topics: list[WeakTopicOut] = Field(default_factory=list)
    rating_breakdown: RatingBreakdownOut = Field(default_factory=RatingBreakdownOut)
    streak_days: int = Field(0, ge=0)
    last_14_days: list[DayActivityOut] = Field(default_factory=list)
