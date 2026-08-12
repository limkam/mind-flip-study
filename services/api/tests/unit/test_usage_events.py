from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from models.usage_event import UsageEvent
from services.usage_events import (
    BOOK_UPLOADED,
    consumed_quantity,
    current_period_start,
    record_usage,
)


def test_paid_period_starts_at_utc_month_boundary():
    now = datetime(2026, 8, 12, 8, 30, tzinfo=timezone.utc)
    assert current_period_start(lifetime=False, now=now) == datetime(2026, 8, 1, tzinfo=timezone.utc)
    assert current_period_start(lifetime=True, now=now) is None


@pytest.mark.asyncio
async def test_consumed_quantity_includes_completed_and_inflight_without_content_counts():
    db = AsyncMock()
    db.scalar = AsyncMock(side_effect=[2, 1])
    used = await consumed_quantity(
        db,
        uuid4(),
        BOOK_UPLOADED,
        period_start=datetime(2026, 8, 1, tzinfo=timezone.utc),
    )
    assert used == 3
    sql = " ".join(str(call.args[0]) for call in db.scalar.await_args_list)
    assert "usage_events" in sql
    assert "usage_reservations" in sql
    assert "books" not in sql
    assert "flashcard_sets" not in sql


@pytest.mark.asyncio
async def test_record_usage_is_idempotent_for_same_operation():
    existing = MagicMock(spec=UsageEvent)
    db = AsyncMock()
    db.scalar = AsyncMock(return_value=existing)

    result = await record_usage(
        db,
        user_id=uuid4(),
        event_type=BOOK_UPLOADED,
        resource_type="book",
        resource_id=uuid4(),
        period_start=None,
        idempotency_key="book-upload:retry-key",
    )

    assert result is existing
    db.add.assert_not_called()
    db.flush.assert_not_awaited()


@pytest.mark.asyncio
async def test_successful_usage_event_is_append_only_and_resource_independent():
    db = AsyncMock()
    db.add = MagicMock()
    db.scalar = AsyncMock(return_value=None)
    user_id = uuid4()
    resource_id = uuid4()

    event = await record_usage(
        db,
        user_id=user_id,
        event_type=BOOK_UPLOADED,
        resource_type="book",
        resource_id=resource_id,
        period_start=None,
        idempotency_key=f"book-upload:{resource_id}",
    )

    assert event.user_id == user_id
    assert event.resource_id == resource_id
    assert event.quantity == 1
    db.add.assert_called_once_with(event)
    db.flush.assert_awaited_once()
