from __future__ import annotations

import os
import uuid
from datetime import UTC, datetime

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from models.book import Book
from models.engagement import Scorecard
from models.enums import BookStatus, UserRole
from models.flashcard import FlashcardSet
from models.quiz import QuizResult, StudyEvent
from models.user import User
from services.scorecards import FORMULA_VERSION, refresh_current_scorecards


@pytest.mark.asyncio
async def test_persisted_weekly_monthly_and_independent_course_scorecards_refresh() -> None:
    url = os.getenv("ENGAGEMENT_TEST_DATABASE_URL")
    if not url:
        pytest.skip("ENGAGEMENT_TEST_DATABASE_URL is required")
    engine = create_async_engine(url)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with sessions() as db:
        user = User(email=f"scorecard-{uuid.uuid4()}@example.test", hashed_password=None, role=UserRole.student, full_name="Scorecard Test", auth_provider="email", preferences={}, subscription_tier="free")
        db.add(user)
        await db.flush()
        books = [Book(user_id=user.id, title=title, author="Test", s3_key=f"{title}.pdf", s3_url=f"https://example.test/{title}", file_size_bytes=1, book_code=f"MF-{uuid.uuid4().hex[:8].upper()}", status=BookStatus.ready, extras={}) for title in ("Biology", "Chemistry")]
        db.add_all(books)
        await db.flush()
        sets = [FlashcardSet(user_id=user.id, book_id=book.id, title=book.title, description="", tags=[]) for book in books]
        db.add_all(sets)
        await db.flush()
        now = datetime.now(UTC)
        db.add_all([
            StudyEvent(user_id=user.id, set_id=sets[0].id, event_type="review", quality=5, created_at=now),
            StudyEvent(user_id=user.id, set_id=sets[1].id, event_type="review", quality=2, created_at=now),
            QuizResult(user_id=user.id, set_id=sets[0].id, score=10, total_questions=10, time_taken_seconds=600, completed_at=now, extras={}),
            QuizResult(user_id=user.id, set_id=sets[1].id, score=2, total_questions=10, time_taken_seconds=60, completed_at=now, extras={}),
        ])
        await db.commit()
        await refresh_current_scorecards(db, user.id)
        rows = list((await db.scalars(select(Scorecard).where(Scorecard.user_id == user.id))).all())
        assert {row.period_type for row in rows} == {"weekly", "monthly", "course"}
        courses = {row.metrics["course_title"]: row for row in rows if row.period_type == "course"}
        assert set(courses) == {"Biology", "Chemistry"}
        assert courses["Biology"].score > courses["Chemistry"].score
        assert all(row.formula_version == FORMULA_VERSION for row in rows)
        first_ids = {row.id for row in rows}
        await refresh_current_scorecards(db, user.id)
        refreshed = list((await db.scalars(select(Scorecard).where(Scorecard.user_id == user.id))).all())
        assert {row.id for row in refreshed} == first_ids
    await engine.dispose()
