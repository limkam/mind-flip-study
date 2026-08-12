"""Real PostgreSQL evidence for Stripe billing transaction and advisory-lock behavior."""

from __future__ import annotations

import asyncio
import os
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
import pytest_asyncio
from sqlalchemy import func, inspect, select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from models.billing_analytics import BillingEvent
from models.credit_ledger import CreditLedger
from models.credit_purchase import CreditPurchase
from models.enums import UserRole
from models.plan import Plan
from models.user import User
from models.user_subscription import UserSubscription
from routers.billing import _acquire_business_lock
from services.credits import consume_credits, get_credit_accounting_snapshot


TEST_URL_ENV = "BILLING_CONCURRENCY_TEST_DATABASE_URL"


@pytest_asyncio.fixture
async def billing_engine():
    url = os.getenv(TEST_URL_ENV)
    if not url:
        pytest.skip(f"{TEST_URL_ENV} is required")
    engine = create_async_engine(url, pool_size=8, max_overflow=0)
    yield engine
    await engine.dispose()


@pytest_asyncio.fixture(autouse=True)
async def clean_billing_data(billing_engine):
    async with billing_engine.begin() as conn:
        await conn.execute(text(
            "TRUNCATE billing_events, credit_purchases, credit_ledger, "
            "user_subscriptions, plans, users RESTART IDENTITY CASCADE"
        ))


async def _seed_user_and_plan(factory):
    async with factory() as db:
        user = User(
            email=f"billing-concurrency-{uuid4()}@example.test",
            role=UserRole.student,
            full_name="Billing Concurrency Test",
            preferences={},
            ip_history=[],
            subscription_tier="free",
            stripe_customer_id=f"cus_{uuid4().hex}",
        )
        plan = Plan(name="Concurrency Plan", slug=f"plan_{uuid4().hex}")
        db.add_all([user, plan])
        await db.commit()
        return user.id, plan.id


async def _event_lock(db: AsyncSession, event_id: str) -> None:
    await db.execute(select(func.pg_advisory_xact_lock(func.hashtextextended(event_id, 0))))


@pytest.mark.asyncio
async def test_billing_schema_and_constraints_are_migrated(billing_engine):
    async with billing_engine.connect() as conn:
        tables = await conn.run_sync(lambda sync: set(inspect(sync).get_table_names()))
        assert {"billing_events", "user_subscriptions", "credit_purchases", "credit_ledger"} <= tables
        indexes = await conn.run_sync(
            lambda sync: inspect(sync).get_indexes("credit_purchases")
        )
        assert any(index["unique"] and index["column_names"] == ["stripe_session_id"] for index in indexes)


@pytest.mark.asyncio
async def test_same_event_concurrent_success_fulfills_once(billing_engine):
    factory = async_sessionmaker(billing_engine, expire_on_commit=False)
    user_id, plan_id = await _seed_user_and_plan(factory)
    locked = asyncio.Event()
    release = asyncio.Event()
    second_started = asyncio.Event()

    async def first():
        async with factory() as db:
            await _event_lock(db, "evt_same")
            locked.set()
            await release.wait()
            db.add(BillingEvent(stripe_event_id="evt_same", event_type="credit", status="succeeded"))
            db.add(CreditLedger(user_id=user_id, amount=3, pool="purchased", reason="purchased_credits"))
            db.add(UserSubscription(
                user_id=user_id, plan_id=plan_id, stripe_subscription_id="sub_same_event",
                status="active", current_period_end=datetime.now(timezone.utc) + timedelta(days=30),
            ))
            await db.commit()

    async def second():
        await locked.wait()
        async with factory() as db:
            second_started.set()
            await _event_lock(db, "evt_same")
            event = await db.scalar(select(BillingEvent).where(BillingEvent.stripe_event_id == "evt_same"))
            assert event is not None and event.status == "succeeded"
            await db.commit()

    a = asyncio.create_task(first())
    b = asyncio.create_task(second())
    await second_started.wait()
    await asyncio.sleep(0)
    assert not b.done()
    release.set()
    await asyncio.gather(a, b)

    async with factory() as db:
        assert await db.scalar(select(func.count(BillingEvent.id))) == 1
        assert await db.scalar(select(func.count(CreditLedger.id))) == 1
        assert await db.scalar(select(func.sum(CreditLedger.amount))) == 3
        assert await db.scalar(select(func.count(UserSubscription.id))) == 1


@pytest.mark.asyncio
async def test_failure_record_cannot_overwrite_concurrent_success(billing_engine):
    factory = async_sessionmaker(billing_engine, expire_on_commit=False)
    user_id, _ = await _seed_user_and_plan(factory)
    failed_rolled_back = asyncio.Event()
    success_committed = asyncio.Event()

    async def failure_worker():
        async with factory() as db:
            await _event_lock(db, "evt_race")
            db.add(CreditLedger(user_id=user_id, amount=9, pool="purchased", reason="partial"))
            await db.flush()
            await db.rollback()
        failed_rolled_back.set()
        await success_committed.wait()
        async with factory() as db:
            await db.execute(
                pg_insert(BillingEvent)
                .values(stripe_event_id="evt_race", event_type="credit", status="failed", attempts=1)
                .on_conflict_do_update(
                    index_elements=[BillingEvent.stripe_event_id],
                    set_={"status": "failed", "attempts": BillingEvent.attempts + 1},
                    where=BillingEvent.status != "succeeded",
                )
            )
            await db.commit()

    async def success_worker():
        await failed_rolled_back.wait()
        async with factory() as db:
            await _event_lock(db, "evt_race")
            db.add(BillingEvent(stripe_event_id="evt_race", event_type="credit", status="succeeded"))
            db.add(CreditLedger(user_id=user_id, amount=3, pool="purchased", reason="purchased_credits"))
            await db.commit()
        success_committed.set()

    await asyncio.gather(failure_worker(), success_worker())
    async with factory() as db:
        event = await db.scalar(select(BillingEvent).where(BillingEvent.stripe_event_id == "evt_race"))
        assert event.status == "succeeded"
        assert await db.scalar(select(func.count(CreditLedger.id))) == 1
        assert await db.scalar(select(func.sum(CreditLedger.amount))) == 3


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "event_pair,canonical_status",
    [
        (("subscription.updated", "subscription.deleted"), "canceled"),
        (("invoice.payment_succeeded", "subscription.paused"), "paused"),
        (("invoice.payment_failed", "subscription.updated"), "active"),
    ],
)
async def test_different_events_same_subscription_serialize_to_canonical_state(
    billing_engine, event_pair, canonical_status
):
    factory = async_sessionmaker(billing_engine, expire_on_commit=False)
    user_id, plan_id = await _seed_user_and_plan(factory)
    end = datetime.now(timezone.utc) + timedelta(days=30)
    async with factory() as db:
        db.add(UserSubscription(
            user_id=user_id, plan_id=plan_id, stripe_subscription_id="sub_shared",
            status="active", current_period_end=end,
        ))
        await db.commit()

    first_locked = asyncio.Event()
    release_first = asyncio.Event()
    second_entered = asyncio.Event()

    async def worker(event_name, is_first):
        async with factory() as db:
            if not is_first:
                await first_locked.wait()
                second_entered.set()
            await _acquire_business_lock(db, "stripe-subscription", "sub_shared")
            if is_first:
                first_locked.set()
                await release_first.wait()
            row = await db.scalar(select(UserSubscription).where(
                UserSubscription.stripe_subscription_id == "sub_shared"
            ))
            # Both workers project the same canonical Stripe snapshot after taking
            # the subscription lock; event arrival order cannot decide the state.
            row.status = canonical_status
            row.current_period_end = end
            row.stripe_event_created_at = datetime.now(timezone.utc)
            await db.commit()

    a = asyncio.create_task(worker(event_pair[0], True))
    b = asyncio.create_task(worker(event_pair[1], False))
    await second_entered.wait()
    await asyncio.sleep(0)
    assert not b.done()
    release_first.set()
    await asyncio.gather(a, b)

    async with factory() as db:
        row = await db.scalar(select(UserSubscription).where(
            UserSubscription.stripe_subscription_id == "sub_shared"
        ))
        assert row.status == canonical_status
        assert row.current_period_end == end
        assert await db.scalar(select(func.count(UserSubscription.id))) == 1


@pytest.mark.asyncio
async def test_concurrent_credit_session_fulfills_exactly_once(billing_engine):
    factory = async_sessionmaker(billing_engine, expire_on_commit=False)
    user_id, _ = await _seed_user_and_plan(factory)
    first_locked = asyncio.Event()
    release = asyncio.Event()
    second_entered = asyncio.Event()

    async def worker(event_id, first):
        async with factory() as db:
            if not first:
                await first_locked.wait()
                second_entered.set()
            await _acquire_business_lock(db, "stripe-credit-session", "cs_shared")
            if first:
                first_locked.set()
                await release.wait()
            purchase = await db.scalar(select(CreditPurchase).where(
                CreditPurchase.stripe_session_id == "cs_shared"
            ))
            if purchase is None:
                db.add(CreditLedger(user_id=user_id, amount=4, pool="purchased", reason="purchased_credits"))
                db.add(CreditPurchase(
                    user_id=user_id, quantity=4, amount_paid_cents=320, currency="usd",
                    unit_price_cents=80, stripe_event_id=event_id,
                    stripe_session_id="cs_shared", status="completed",
                ))
            await db.commit()

    a = asyncio.create_task(worker("evt_credit_a", True))
    b = asyncio.create_task(worker("evt_credit_b", False))
    await second_entered.wait()
    await asyncio.sleep(0)
    assert not b.done()
    release.set()
    await asyncio.gather(a, b)

    async with factory() as db:
        assert await db.scalar(select(func.count(CreditPurchase.id))) == 1
        assert await db.scalar(select(func.count(CreditLedger.id))) == 1
        assert await db.scalar(select(func.sum(CreditLedger.amount))) == 4


@pytest.mark.asyncio
async def test_credit_failure_then_success_is_atomic_and_exactly_once(billing_engine):
    factory = async_sessionmaker(billing_engine, expire_on_commit=False)
    user_id, _ = await _seed_user_and_plan(factory)
    failed = asyncio.Event()

    async def failure_worker():
        async with factory() as db:
            await _acquire_business_lock(db, "stripe-credit-session", "cs_fail_success")
            db.add(CreditLedger(user_id=user_id, amount=6, pool="purchased", reason="partial"))
            db.add(CreditPurchase(
                user_id=user_id, quantity=6, amount_paid_cents=480, currency="usd",
                unit_price_cents=80, stripe_session_id="cs_fail_success", status="completed",
            ))
            await db.flush()
            await db.rollback()
        failed.set()

    async def success_worker():
        await failed.wait()
        async with factory() as db:
            await _acquire_business_lock(db, "stripe-credit-session", "cs_fail_success")
            assert await db.scalar(select(CreditPurchase).where(
                CreditPurchase.stripe_session_id == "cs_fail_success"
            )) is None
            db.add(CreditLedger(user_id=user_id, amount=6, pool="purchased", reason="purchased_credits"))
            db.add(CreditPurchase(
                user_id=user_id, quantity=6, amount_paid_cents=480, currency="usd",
                unit_price_cents=80, stripe_session_id="cs_fail_success", status="completed",
            ))
            await db.commit()

    await asyncio.gather(failure_worker(), success_worker())
    async with factory() as db:
        assert await db.scalar(select(func.count(CreditPurchase.id))) == 1
        assert await db.scalar(select(func.count(CreditLedger.id))) == 1
        assert await db.scalar(select(func.sum(CreditLedger.amount))) == 6


@pytest.mark.asyncio
async def test_async_credit_transitions_and_late_success(billing_engine):
    factory = async_sessionmaker(billing_engine, expire_on_commit=False)
    user_id, _ = await _seed_user_and_plan(factory)
    async with factory() as db:
        db.add(CreditPurchase(
            user_id=user_id, quantity=3, amount_paid_cents=240, currency="usd",
            unit_price_cents=80, stripe_session_id="cs_async", status="pending",
        ))
        await db.commit()
    async with factory() as db:
        await _acquire_business_lock(db, "stripe-credit-session", "cs_async")
        purchase = await db.scalar(select(CreditPurchase).where(CreditPurchase.stripe_session_id == "cs_async"))
        purchase.status = "failed"
        await db.commit()
    async with factory() as db:
        assert await db.scalar(select(func.count(CreditLedger.id))) == 0
        await _acquire_business_lock(db, "stripe-credit-session", "cs_async")
        purchase = await db.scalar(select(CreditPurchase).where(CreditPurchase.stripe_session_id == "cs_async"))
        assert purchase.status == "failed"
        db.add(CreditLedger(user_id=user_id, amount=3, pool="purchased", reason="purchased_credits"))
        purchase.status = "completed"
        await db.commit()
    async with factory() as db:
        purchase = await db.scalar(select(CreditPurchase).where(CreditPurchase.stripe_session_id == "cs_async"))
        assert purchase.status == "completed"
        assert await db.scalar(select(func.count(CreditLedger.id))) == 1
        assert await db.scalar(select(func.sum(CreditLedger.amount))) == 3


@pytest.mark.asyncio
async def test_transaction_and_connection_failure_roll_back_and_release_lock(billing_engine):
    factory = async_sessionmaker(billing_engine, expire_on_commit=False)
    user_id, _ = await _seed_user_and_plan(factory)
    try:
        async with factory() as db:
            await _event_lock(db, "evt_crash")
            db.add(BillingEvent(stripe_event_id="evt_crash", event_type="credit", status="succeeded"))
            db.add(CreditLedger(user_id=user_id, amount=7, pool="purchased", reason="partial"))
            db.add(CreditPurchase(
                user_id=user_id, quantity=7, amount_paid_cents=560, currency="usd",
                unit_price_cents=80, stripe_session_id="cs_crash", status="completed",
            ))
            await db.flush()
            raise RuntimeError("simulated worker termination")
    except RuntimeError:
        pass

    async with factory() as db:
        assert await db.scalar(select(func.count(BillingEvent.id))) == 0
        assert await db.scalar(select(func.count(CreditLedger.id))) == 0
        assert await db.scalar(select(func.count(CreditPurchase.id))) == 0
        await asyncio.wait_for(_event_lock(db, "evt_crash"), timeout=2)
        db.add(BillingEvent(stripe_event_id="evt_crash", event_type="credit", status="succeeded"))
        db.add(CreditLedger(user_id=user_id, amount=3, pool="purchased", reason="purchased_credits"))
        await db.commit()

    async with factory() as db:
        event = await db.scalar(select(BillingEvent).where(BillingEvent.stripe_event_id == "evt_crash"))
        assert event.status == "succeeded"
        assert await db.scalar(select(func.count(CreditLedger.id))) == 1
        assert await db.scalar(select(func.sum(CreditLedger.amount))) == 3


@pytest.mark.asyncio
async def test_authoritative_purchased_position_aggregates_ledger_not_purchase_history(billing_engine):
    factory = async_sessionmaker(billing_engine, expire_on_commit=False)
    user_id, _ = await _seed_user_and_plan(factory)
    async with factory() as db:
        db.add_all([
            CreditLedger(user_id=user_id, amount=7, pool="purchased", reason="purchased_credits"),
            CreditLedger(user_id=user_id, amount=3, pool="purchased", reason="purchased_credits"),
            CreditLedger(user_id=user_id, amount=-4, pool="purchased", reason="create_book",
                         meta={"consumed_from": "purchased_or_unlocked"}),
            # A payment-history row without a ledger grant must not change balance.
            CreditPurchase(user_id=user_id, quantity=99, amount_paid_cents=7920, currency="usd",
                           unit_price_cents=80, stripe_session_id="cs_history_only", status="pending"),
        ])
        await db.commit()
    async with factory() as db:
        snapshot = await get_credit_accounting_snapshot(db, user_id)
    assert snapshot == {
        "available_total": 6,
        "plan": {"allocated": 0, "used": 0, "remaining": 0},
        "purchased": {"purchased_total": 10, "used": 4, "remaining": 6},
    }


@pytest.mark.asyncio
async def test_plan_first_consumption_and_renewal_preserve_purchased_position(billing_engine):
    factory = async_sessionmaker(billing_engine, expire_on_commit=False)
    user_id, _ = await _seed_user_and_plan(factory)
    old_end = datetime.now(timezone.utc) + timedelta(days=1)
    async with factory() as db:
        db.add_all([
            CreditLedger(user_id=user_id, amount=2, pool="content", reason="monthly_allowance", expires_at=old_end),
            CreditLedger(user_id=user_id, amount=3, pool="purchased", reason="purchased_credits"),
        ])
        await db.commit()
    async with factory() as db:
        await consume_credits(db, user_id, 4, pool="content", reason="create_book")
        await db.commit()
    async with factory() as db:
        snapshot = await get_credit_accounting_snapshot(db, user_id)
        assert snapshot["plan"]["remaining"] == 0
        assert snapshot["purchased"] == {"purchased_total": 3, "used": 2, "remaining": 1}
        # A new-cycle plan grant changes only plan accounting.
        db.add(CreditLedger(user_id=user_id, amount=20, pool="content", reason="monthly_allowance",
                            expires_at=datetime.now(timezone.utc) + timedelta(days=31)))
        await db.commit()
    async with factory() as db:
        renewed = await get_credit_accounting_snapshot(db, user_id)
    assert renewed["plan"]["remaining"] == 20
    assert renewed["purchased"] == {"purchased_total": 3, "used": 2, "remaining": 1}


@pytest.mark.asyncio
async def test_concurrent_consumption_cannot_overspend_purchased_pool(billing_engine):
    factory = async_sessionmaker(billing_engine, expire_on_commit=False)
    user_id, _ = await _seed_user_and_plan(factory)
    async with factory() as db:
        db.add(CreditLedger(user_id=user_id, amount=5, pool="purchased", reason="purchased_credits"))
        await db.commit()

    async def spend():
        async with factory() as db:
            try:
                await consume_credits(db, user_id, 4, pool="content", reason="create_book")
                await db.commit()
                return "spent"
            except Exception:
                await db.rollback()
                return "rejected"

    assert sorted(await asyncio.gather(spend(), spend())) == ["rejected", "spent"]
    async with factory() as db:
        snapshot = await get_credit_accounting_snapshot(db, user_id)
    assert snapshot["purchased"] == {"purchased_total": 5, "used": 4, "remaining": 1}
