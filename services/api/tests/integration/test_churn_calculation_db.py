"""Locks in the canonical churn definition against a small fixture of known subscriptions.

Regression coverage for services.financial_metrics_service.calculate_monthly_churn — the
single implementation admin_analytics.py, admin.py, and owner_dashboard_service.py all now
call, replacing three previously-disagreeing calculations.
"""

from __future__ import annotations

import os
import uuid
from datetime import UTC, datetime

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from models.enums import UserRole
from models.plan import Plan
from models.user import User
from models.user_subscription import UserSubscription
from services.financial_metrics_service import calculate_monthly_churn

TEST_URL_ENV = "CHURN_TEST_DATABASE_URL"

PERIOD_START = datetime(2026, 1, 1, tzinfo=UTC)
NOW = datetime(2026, 2, 1, tzinfo=UTC)
BEFORE_WINDOW = datetime(2025, 6, 1, tzinfo=UTC)
CANCELED_BEFORE_PERIOD = datetime(2025, 12, 1, tzinfo=UTC)
CANCELED_IN_WINDOW = datetime(2026, 1, 15, tzinfo=UTC)
STARTED_IN_WINDOW = datetime(2026, 1, 10, tzinfo=UTC)
CANCELED_AFTER_NOW = datetime(2026, 2, 15, tzinfo=UTC)


def _user(email: str) -> User:
    return User(
        email=email,
        hashed_password=None,
        role=UserRole.student,
        full_name="Churn Fixture",
        auth_provider="email",
        preferences={},
        subscription_tier="free",
    )


def _sub(*, user_id, plan_id, started_at, canceled_at=None) -> UserSubscription:
    return UserSubscription(
        user_id=user_id,
        plan_id=plan_id,
        stripe_subscription_id=f"sub_{uuid.uuid4()}",
        status="canceled" if canceled_at else "active",
        subscription_started_at=started_at,
        canceled_at=canceled_at,
    )


@pytest.mark.asyncio
async def test_monthly_churn_matches_known_fixture() -> None:
    url = os.getenv(TEST_URL_ENV)
    if not url:
        pytest.skip(f"{TEST_URL_ENV} is required")
    engine = create_async_engine(url)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with sessions() as db:
        suffix = uuid.uuid4().hex[:8]
        plan = Plan(name="Churn Fixture Plan", slug=f"churn-fixture-{suffix}", price_ids={})
        db.add(plan)
        await db.flush()

        # A: active the whole time — starting customer, not churned.
        user_a = _user(f"churn-a-{suffix}@example.test")
        # B: active at period start, canceled inside the window — starting customer AND churned.
        user_b = _user(f"churn-b-{suffix}@example.test")
        # C: canceled before the window opened — excluded from both counts.
        user_c = _user(f"churn-c-{suffix}@example.test")
        # D: subscribed AND canceled inside the window — not a starting customer, but still
        #    counted as churned (matches the simplified numerator both prior implementations used).
        user_d = _user(f"churn-d-{suffix}@example.test")
        # E: active at period start, canceled after `now` — starting customer, not yet churned.
        user_e = _user(f"churn-e-{suffix}@example.test")
        db.add_all([user_a, user_b, user_c, user_d, user_e])
        await db.flush()

        db.add_all([
            _sub(user_id=user_a.id, plan_id=plan.id, started_at=BEFORE_WINDOW),
            _sub(user_id=user_b.id, plan_id=plan.id, started_at=BEFORE_WINDOW, canceled_at=CANCELED_IN_WINDOW),
            _sub(user_id=user_c.id, plan_id=plan.id, started_at=BEFORE_WINDOW, canceled_at=CANCELED_BEFORE_PERIOD),
            _sub(user_id=user_d.id, plan_id=plan.id, started_at=STARTED_IN_WINDOW, canceled_at=STARTED_IN_WINDOW),
            _sub(user_id=user_e.id, plan_id=plan.id, started_at=BEFORE_WINDOW, canceled_at=CANCELED_AFTER_NOW),
        ])
        # Flush (not commit) so the fixture rows are visible to the read-your-writes query
        # below within this same transaction, then roll back — keeps the dedicated churn
        # test database clean and the test re-runnable without accumulating rows.
        await db.flush()

        try:
            snapshot = await calculate_monthly_churn(db, period_start=PERIOD_START, now=NOW)

            # Starting customers at period start: A, B, E (C already canceled, D not yet subscribed).
            assert snapshot.starting_customers == 3
            # Churned within the window: B, D.
            assert snapshot.churned_users == 2
            assert snapshot.churn_rate_pct == pytest.approx(66.7)
        finally:
            await db.rollback()
    await engine.dispose()
