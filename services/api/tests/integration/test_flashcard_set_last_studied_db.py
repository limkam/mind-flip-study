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
from routers.flashcards import _last_studied_map


@pytest.mark.asyncio
async def test_last_studied_map_reflects_most_recent_review_per_set_and_user() -> None:
    url = os.getenv("ENGAGEMENT_TEST_DATABASE_URL")
    if not url:
        pytest.skip("ENGAGEMENT_TEST_DATABASE_URL is required")
    engine = create_async_engine(url)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with sessions() as db:
        user = User(
            email=f"last-studied-{uuid.uuid4()}@example.test",
            hashed_password=None,
            role=UserRole.student,
            full_name="Last Studied Test",
            auth_provider="email",
            preferences={},
            subscription_tier="free",
        )
        other_user = User(
            email=f"last-studied-other-{uuid.uuid4()}@example.test",
            hashed_password=None,
            role=UserRole.student,
            full_name="Other User",
            auth_provider="email",
            preferences={},
            subscription_tier="free",
        )
        db.add_all([user, other_user])
        await db.flush()

        studied_set = FlashcardSet(user_id=user.id, book_id=None, title="Studied", description="", tags=[])
        untouched_set = FlashcardSet(user_id=user.id, book_id=None, title="Untouched", description="", tags=[])
        db.add_all([studied_set, untouched_set])
        await db.flush()

        older_card = Flashcard(set_id=studied_set.id, front="Q1", back="A1")
        newer_card = Flashcard(set_id=studied_set.id, front="Q2", back="A2")
        untouched_card = Flashcard(set_id=untouched_set.id, front="Q3", back="A3")
        db.add_all([older_card, newer_card, untouched_card])
        await db.flush()

        now = datetime.now(UTC)
        db.add_all([
            CardProgress(user_id=user.id, card_id=older_card.id, last_reviewed_at=now - timedelta(days=3)),
            CardProgress(user_id=user.id, card_id=newer_card.id, last_reviewed_at=now - timedelta(hours=1)),
            # Another user's progress on the same card must not leak into this user's map.
            CardProgress(user_id=other_user.id, card_id=older_card.id, last_reviewed_at=now),
        ])
        await db.commit()

        result = await _last_studied_map(
            db, [studied_set.id, untouched_set.id], user.id,
        )

        assert result[studied_set.id] == now - timedelta(hours=1)
        assert untouched_set.id not in result
    await engine.dispose()
