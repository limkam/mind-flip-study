from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from models.plan import Plan
from models.user_subscription import UserSubscription
from services.entitlements import Action, can_user_do


class _User:
    def __init__(self, id):
        self.id = id


def _db_with_plan(plan_slug: str) -> AsyncMock:
    """Mocks the two real db.scalar calls in can_user_do's ACTIVATE_SHARED_CONTENT path:
    _user_plan_slug's UserSubscription lookup, then _plan_features' Plan lookup (returns
    None so DEFAULT_PLAN_FEATURES applies)."""
    plan_id = uuid4()
    sub = UserSubscription(
        user_id=uuid4(),
        plan_id=plan_id,
        status="active",
        current_period_end=datetime.now(timezone.utc) + timedelta(days=1),
    )
    db = AsyncMock()
    db.scalar = AsyncMock(side_effect=[sub, None])
    db.get = AsyncMock(return_value=Plan(id=plan_id, slug=plan_slug, name=plan_slug))
    return db


@pytest.mark.asyncio
async def test_activate_shared_content_allowed_when_under_limit(monkeypatch):
    # standard_15: max_books=5, max_sets=10. owned=1 (already includes any prior
    # activations, since activation is charged into the same permanent ledger as
    # own uploads) -> well under both limits.
    monkeypatch.setattr("services.entitlements.consumed_quantity", AsyncMock(return_value=1))
    db = _db_with_plan("standard_15")

    decision = await can_user_do(db, _User(uuid4()), Action.ACTIVATE_SHARED_CONTENT)

    assert decision["allowed"] is True


@pytest.mark.asyncio
async def test_activate_shared_content_blocked_at_book_limit(monkeypatch):
    # standard_15: max_books=5. owned=5 (own uploads + prior activations, all permanent
    # ledger charges) >= 5 -> blocked on books.
    monkeypatch.setattr("services.entitlements.consumed_quantity", AsyncMock(return_value=5))
    db = _db_with_plan("standard_15")

    decision = await can_user_do(db, _User(uuid4()), Action.ACTIVATE_SHARED_CONTENT)

    assert decision["allowed"] is False
    assert decision["reason"] == "book_limit"


@pytest.mark.asyncio
async def test_activate_shared_content_checks_ledger_only_no_live_activation_count(monkeypatch):
    """Regression test: the quota check must match CREATE_BOOK/CREATE_SET exactly — a single
    consumed_quantity() read against the permanent ledger. It must NOT also add a live count of
    currently-active StudyGroupContentActivation rows on top, which previously double-counted
    every active activation (once in the ledger, once live) and made deactivation look like it
    freed a slot it never actually freed."""
    consumed = AsyncMock(return_value=0)
    monkeypatch.setattr("services.entitlements.consumed_quantity", consumed)
    db = _db_with_plan("free")

    decision = await can_user_do(db, _User(uuid4()), Action.ACTIVATE_SHARED_CONTENT)

    assert decision["allowed"] is True
    # Exactly one consumed_quantity call per limited dimension (books, sets) — no separate
    # live-count source is consulted at all.
    assert consumed.await_count == 2


@pytest.mark.asyncio
async def test_activate_shared_content_does_not_write_usage_events(monkeypatch):
    """The entitlement check itself must never call record_usage / touch the ledger —
    only the caller does that on success."""
    record_usage = AsyncMock()
    monkeypatch.setattr("services.entitlements.consumed_quantity", AsyncMock(return_value=0))
    monkeypatch.setattr("services.usage_events.record_usage", record_usage)
    db = _db_with_plan("free")

    decision = await can_user_do(db, _User(uuid4()), Action.ACTIVATE_SHARED_CONTENT)

    assert decision["allowed"] is True
    record_usage.assert_not_awaited()
