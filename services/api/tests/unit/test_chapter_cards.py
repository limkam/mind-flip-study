"""Unit tests for per-chapter flashcard counts."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from services.chapter_cards import chapter_card_counts_for_book


@pytest.mark.asyncio
async def test_chapter_card_counts_maps_query_rows():
    mock_result = MagicMock()
    mock_result.all.return_value = [("Introduction", 2), ("Chapter 2", 1)]
    db = AsyncMock()
    db.execute = AsyncMock(return_value=mock_result)

    counts = await chapter_card_counts_for_book(
        db,
        book_id=uuid4(),
        user_id=uuid4(),
    )

    assert counts == {"Introduction": 2, "Chapter 2": 1}
    db.execute.assert_awaited_once()
