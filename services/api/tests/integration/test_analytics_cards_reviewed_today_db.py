from __future__ import annotations

import os
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from models.enums import UserRole
from models.flashcard import Flashcard, FlashcardSet
from models.quiz import CardProgress
from models.user import User
from routers.analytics import _cards_reviewed_today


@pytest.mark.asyncio
async def test_cards_reviewed_today_counts_distinct_cards_reviewed_today_only() -> None:
    url = os.getenv("ENGAGEMENT_TEST_DATABASE_URL")
    if not url:
        pytest.skip("ENGAGEMENT_TEST_DATABASE_URL is required")
    engine = create_async_engine(url)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with sessions() as db:
        user = User(
            email=f"reviewed-today-{uuid.uuid4()}@example.test",
            hashed_password=None,
            role=UserRole.student,
            full_name="Reviewed Today Test",
            auth_provider="email",
            preferences={},
            subscription_tier="free",
        )
        db.add(user)
        await db.flush()

        s = FlashcardSet(user_id=user.id, book_id=None, title="Set", description="", tags=[])
        db.add(s)
        await db.flush()

        today_card_a = Flashcard(set_id=s.id, front="Q1", back="A1")
        today_card_b = Flashcard(set_id=s.id, front="Q2", back="A2")
        yesterday_card = Flashcard(set_id=s.id, front="Q3", back="A3")
        db.add_all([today_card_a, today_card_b, yesterday_card])
        await db.flush()

        now = datetime.now(UTC)
        db.add_all([
            CardProgress(user_id=user.id, card_id=today_card_a.id, last_reviewed_at=now),
            CardProgress(user_id=user.id, card_id=today_card_b.id, last_reviewed_at=now - timedelta(hours=2)),
            CardProgress(user_id=user.id, card_id=yesterday_card.id, last_reviewed_at=now - timedelta(days=1)),
        ])
        await db.commit()

        count = await _cards_reviewed_today(db, user.id, now.date())
        assert count == 2
    await engine.dispose()
