"""Unit tests for server-side achievement sync."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from services.achievement_sync import ACHIEVEMENT_DEFS, compute_achievement_stats, sync_user_achievements


@pytest.mark.asyncio
async def test_first_quiz_achievement_awarded():
    user_id = uuid4()
    count_result = MagicMock()
    count_result.one.return_value = (1, 0)

    dates_scalars = MagicMock()
    dates_scalars.all.return_value = []

    existing_result = MagicMock()
    existing_scalars = MagicMock()
    existing_scalars.all.return_value = []
    existing_result.scalars.return_value = existing_scalars

    db = AsyncMock()
    db.execute = AsyncMock(side_effect=[count_result, existing_result])
    db.scalar = AsyncMock(side_effect=[0, 0])
    db.scalars = AsyncMock(return_value=dates_scalars)
    db.add = MagicMock()
    db.commit = AsyncMock()

    await sync_user_achievements(db, user_id)

    assert db.add.call_count >= 1
    added = db.add.call_args_list[0][0][0]
    assert added.achievement_type == "first_quiz"
    db.commit.assert_awaited_once()


def test_achievement_defs_include_first_quiz():
    ids = {a.achievement_type for a in ACHIEVEMENT_DEFS}
    assert "first_quiz" in ids
    assert ACHIEVEMENT_DEFS[0].check({"quiz_count": 1, "has_perfect": False, "streak": 0, "total_cards": 0, "challenges_sent": 0})
