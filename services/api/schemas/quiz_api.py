from datetime import date, datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class CardProgressOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    card_id: UUID
    ease_factor: float
    interval_days: int
    repetitions: int
    next_review_date: date | None
    last_reviewed_at: datetime | None
    times_correct: int
    times_incorrect: int


class CardProgressUpsert(BaseModel):
    next_review_date: date
    ease_factor: float | None = None
    interval_days: int | None = None
    repetitions: int | None = None
    last_reviewed_at: datetime | None = None
    times_correct: int | None = None
    times_incorrect: int | None = None


class StudyProgressIn(BaseModel):
    """SM-2 review rating; enforced at validation (422) if out of range."""

    card_id: UUID
    quality: int = Field(..., ge=0, le=5, description="0=blackout … 5=perfect")


class DueFlashcardOut(BaseModel):
    """Flashcard row plus optional SM-2 progress for the current user."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    set_id: UUID
    front: str
    back: str
    created_at: datetime
    set_title: str
    ease_factor: float | None = None
    interval_days: int | None = None
    next_review_date: date | None = None
    repetitions: int | None = None


class QuizResultCreate(BaseModel):
    set_id: UUID
    score: int = Field(..., ge=0)
    total_questions: int = Field(..., ge=1)
    time_taken_seconds: int = Field(..., ge=0)
    extras: dict[str, Any] | None = None


class QuizResultPage(BaseModel):
    items: list["QuizResultOut"]
    total: int = Field(..., ge=0)
    page: int = Field(..., ge=1)
    size: int = Field(..., ge=1)
    has_more: bool
    total_pages: int = Field(..., ge=0, description="ceil(total / size); 0 when total is 0")


class QuizResultOut(BaseModel):
    """Shape aligned with Quiz History / Leaderboard / Analytics in the SPA."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    set_id: UUID
    score: int
    total_questions: int
    time_taken_seconds: int
    completed_at: datetime
    extras: dict[str, Any] = Field(default_factory=dict)
    flashcard_set_id: UUID | None = None
    percentage: float | None = None
    player_email: str | None = None
    player_name: str | None = None
    set_title: str | None = None
    book_title: str | None = None

    @staticmethod
    def from_orm_row(row: Any, extras: dict[str, Any] | None = None) -> "QuizResultOut":
        ex = dict(extras if extras is not None else (row.extras or {}))
        # Do not expose PII in API responses (legacy rows may still store these in JSONB).
        ex.pop("player_email", None)
        ex.pop("player_name", None)
        raw_pct = ex.get("percentage")
        if raw_pct is not None and raw_pct != "":
            try:
                pct: float | None = round(float(raw_pct), 1)
            except (TypeError, ValueError):
                pct = None
        else:
            pct = None
        if pct is None and row.total_questions:
            pct = round(100.0 * row.score / row.total_questions, 1)
        return QuizResultOut(
            id=row.id,
            user_id=row.user_id,
            set_id=row.set_id,
            score=row.score,
            total_questions=row.total_questions,
            time_taken_seconds=row.time_taken_seconds,
            completed_at=row.completed_at,
            extras=ex,
            flashcard_set_id=row.set_id,
            percentage=pct,
            player_email=None,
            player_name=None,
            set_title=ex.get("set_title"),
            book_title=ex.get("book_title"),
        )


class QuizChallengeCreate(BaseModel):
    flashcard_set_id: UUID
    opponent_email: str = Field(..., min_length=3, max_length=255)
    set_title: str | None = None
    book_title: str | None = None
    challenger_percentage: int | None = Field(None, ge=0, le=100)


QuizResultPage.model_rebuild()