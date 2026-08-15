from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4
import types
import sys

import pytest

import routers.billing as billing


class _Req:
    def __init__(self):
        self.headers = {"stripe-signature": "sig"}

    async def body(self):
        return b"{}"


class _ExecResult:
    def __init__(self, user=None):
        self._user = user

    def scalar_one_or_none(self):
        return self._user


@pytest.mark.asyncio
async def test_webhook_unpaid_payment_does_not_award_credits(monkeypatch):
    user = SimpleNamespace(id=uuid4(), email="u@example.com", full_name="User", stripe_customer_id=None)
    db = AsyncMock()
    db.add = lambda *_args, **_kwargs: None

    async def fake_execute(stmt):
        return _ExecResult(user)

    db.execute = fake_execute
    db.scalar = AsyncMock(side_effect=[None, None])  # event claim, existing purchase lookup
    db.commit = AsyncMock()
    redis = AsyncMock()
    redis.set = AsyncMock(return_value=True)

    monkeypatch.setattr(billing.settings, "STRIPE_WEBHOOK_SECRET", "whsec_test")
    monkeypatch.setattr(
        billing.stripe.Webhook,
        "construct_event",
        lambda payload, sig, secret: {
            "id": "evt_test_unpaid",
            "type": "checkout.session.completed",
            "data": {
                "object": {
                    "id": "cs_test_unpaid",
                    "mode": "payment",
                    "payment_status": "unpaid",
                    "customer": "cus_1",
                    "metadata": {
                        "user_id": str(user.id),
                        "credit_quantity": "3",
                        "unit_price_cents": "80",
                        "currency": "usd",
                    },
                    "amount_total": 240,
                    "currency": "usd",
                    "payment_intent": "pi_unpaid",
                }
            },
        },
    )

    award_mock = AsyncMock()
    monkeypatch.setattr(billing.credits_service, "award_onetime_credits_for_user", award_mock)

    out = await billing.stripe_webhook(_Req(), db=db, redis=redis)
    assert out == {"received": True}
    award_mock.assert_not_called()


@pytest.mark.asyncio
async def test_webhook_duplicate_event_short_circuits(monkeypatch):
    db = AsyncMock()
    db.scalar = AsyncMock(return_value=SimpleNamespace(status="succeeded"))
    redis = AsyncMock()

    monkeypatch.setattr(billing.settings, "STRIPE_WEBHOOK_SECRET", "whsec_test")
    monkeypatch.setattr(
        billing.stripe.Webhook,
        "construct_event",
        lambda payload, sig, secret: {"id": "evt_dup", "type": "checkout.session.completed", "data": {"object": {"mode": "payment"}}},
    )

    award_mock = AsyncMock()
    monkeypatch.setattr(billing.credits_service, "award_onetime_credits_for_user", award_mock)

    out = await billing.stripe_webhook(_Req(), db=db, redis=redis)
    assert out == {"received": True}
    award_mock.assert_not_called()


@pytest.mark.asyncio
async def test_webhook_processing_marker_allows_retry(monkeypatch):
    """A prior failed attempt must not make the next Stripe delivery disappear."""
    db = AsyncMock()
    db.add = MagicMock()
    failed_event = SimpleNamespace(
        status="failed", attempts=1, error="prior failure", payload=None,
        processed_at=None,
    )
    db.scalar = AsyncMock(return_value=failed_event)
    redis = AsyncMock()
    monkeypatch.setattr(billing.settings, "STRIPE_WEBHOOK_SECRET", "whsec_test")
    monkeypatch.setattr(
        billing.stripe.Webhook,
        "construct_event",
        lambda *_args: {
            "id": "evt_retry",
            "created": 1_800_000_000,
            "type": "customer.subscription.updated",
            "data": {"object": {"id": "sub_1"}},
        },
    )
    sync_mock = AsyncMock(return_value=True)
    monkeypatch.setattr(billing, "_reconcile_canonical_subscription", sync_mock)

    out = await billing.stripe_webhook(_Req(), db=db, redis=redis)

    assert out == {"received": True}
    sync_mock.assert_awaited_once_with(db, "sub_1", event_created_at=billing.datetime.fromtimestamp(1_800_000_000, tz=billing.timezone.utc))
    assert failed_event.status == "succeeded"
    assert failed_event.attempts == 2


@pytest.mark.asyncio
@pytest.mark.parametrize("canonical_status", ["active", "trialing"])
async def test_subscription_checkout_reconciles_canonical_access_state(monkeypatch, canonical_status):
    user = SimpleNamespace(id=uuid4(), stripe_customer_id="cus_1")
    db = AsyncMock()
    db.add = MagicMock()
    db.scalar = AsyncMock(return_value=None)  # new BillingEvent claim
    db.execute = AsyncMock(return_value=_ExecResult(user))
    redis = AsyncMock()
    event = {
        "id": f"evt_{canonical_status}",
        "type": "checkout.session.completed",
        "data": {"object": {
            "id": "cs_subscription",
            "mode": "subscription",
            "customer": "cus_1",
            "subscription": "sub_1",
            "client_reference_id": str(user.id),
            "metadata": {"user_id": str(user.id), "plan_slug": "standard_15"},
        }},
    }
    canonical = {"id": "sub_1", "customer": "cus_1", "status": canonical_status}
    monkeypatch.setattr(billing.settings, "STRIPE_SECRET_KEY", "sk_test")
    monkeypatch.setattr(billing.settings, "STRIPE_WEBHOOK_SECRET", "whsec_test")
    monkeypatch.setattr(billing.stripe.Webhook, "construct_event", lambda *_args: event)
    monkeypatch.setattr(billing.asyncio, "to_thread", AsyncMock(return_value=canonical))
    sync_mock = AsyncMock(return_value=True)
    monkeypatch.setattr(billing, "_sync_subscription_from_stripe_object", sync_mock)

    out = await billing.stripe_webhook(_Req(), db=db, redis=redis)

    assert out == {"received": True}
    sync_mock.assert_awaited_once()
    assert sync_mock.await_args.args[1]["status"] == canonical_status


@pytest.mark.asyncio
async def test_subscription_checkout_incomplete_never_infers_active(monkeypatch):
    user = SimpleNamespace(id=uuid4(), stripe_customer_id="cus_1")
    db = AsyncMock()
    db.add = MagicMock()
    db.scalar = AsyncMock(return_value=None)
    db.execute = AsyncMock(return_value=_ExecResult(user))
    event = {
        "id": "evt_incomplete",
        "type": "checkout.session.completed",
        "data": {"object": {
            "mode": "subscription", "customer": "cus_1", "subscription": "sub_1",
            "client_reference_id": str(user.id), "metadata": {"user_id": str(user.id)},
        }},
    }
    monkeypatch.setattr(billing.settings, "STRIPE_SECRET_KEY", "sk_test")
    monkeypatch.setattr(billing.settings, "STRIPE_WEBHOOK_SECRET", "whsec_test")
    monkeypatch.setattr(billing.stripe.Webhook, "construct_event", lambda *_args: event)
    monkeypatch.setattr(
        billing.asyncio, "to_thread",
        AsyncMock(return_value={"id": "sub_1", "customer": "cus_1", "status": "incomplete"}),
    )
    sync_mock = AsyncMock(return_value=True)
    monkeypatch.setattr(billing, "_sync_subscription_from_stripe_object", sync_mock)

    await billing.stripe_webhook(_Req(), db=db, redis=AsyncMock())

    assert sync_mock.await_args.args[1]["status"] == "incomplete"


@pytest.mark.asyncio
async def test_failed_fulfillment_is_recorded_and_can_retry(monkeypatch):
    request = _Req()
    db = AsyncMock()
    first = AsyncMock(side_effect=RuntimeError("temporary failure"))
    monkeypatch.setattr(billing, "_stripe_webhook_impl", first)
    request._stripe_event_id = "evt_retryable"

    with pytest.raises(RuntimeError, match="temporary failure"):
        await billing.stripe_webhook(request, db=db, redis=AsyncMock())

    db.rollback.assert_awaited_once()
    db.execute.assert_awaited_once()
    failure_stmt = db.execute.await_args.args[0]
    assert "billing_events.status !=" in str(failure_stmt)
    db.commit.assert_awaited_once()

    monkeypatch.setattr(
        billing, "_stripe_webhook_impl",
        AsyncMock(return_value={"received": True}),
    )
    assert await billing.stripe_webhook(request, db=db, redis=AsyncMock()) == {"received": True}


@pytest.mark.asyncio
@pytest.mark.parametrize("case", ["client", "customer", "other_user", "missing_user"])
async def test_credit_webhook_rejects_inconsistent_ownership(monkeypatch, case):
    user = SimpleNamespace(id=uuid4(), email="u@example.com", full_name="User", stripe_customer_id="cus_owner")
    metadata_user = uuid4() if case == "other_user" else user.id
    client_ref = uuid4() if case == "client" else metadata_user
    customer = "cus_other" if case == "customer" else "cus_owner"
    db = AsyncMock()
    db.add = MagicMock()
    db.scalar = AsyncMock(return_value=None)
    db.execute = AsyncMock(return_value=_ExecResult(None if case == "missing_user" else user))
    event = {
        "id": f"evt_owner_{case}", "type": "checkout.session.completed",
        "data": {"object": {
            "id": f"cs_owner_{case}", "mode": "payment", "payment_status": "paid",
            "client_reference_id": str(client_ref), "customer": customer,
            "metadata": {"user_id": str(metadata_user), "credit_quantity": "3", "unit_price_cents": "80", "currency": "usd"},
            "amount_total": 240, "currency": "usd",
        }},
    }
    monkeypatch.setattr(billing.settings, "STRIPE_WEBHOOK_SECRET", "whsec_test")
    monkeypatch.setattr(billing.stripe.Webhook, "construct_event", lambda *_args: event)
    award = AsyncMock()
    monkeypatch.setattr(billing.credits_service, "award_onetime_credits_for_user", award)

    with pytest.raises(ValueError):
        await billing.stripe_webhook(_Req(), db=db, redis=AsyncMock())

    award.assert_not_awaited()


@pytest.mark.asyncio
async def test_delayed_credit_payment_fulfills_pending_purchase_once(monkeypatch):
    user = SimpleNamespace(id=uuid4(), email="u@example.com", full_name="User", stripe_customer_id="cus_1")
    added = []
    db = AsyncMock()
    db.add = added.append
    db.execute = AsyncMock(return_value=_ExecResult(user))
    redis = AsyncMock()
    base_session = {
        "id": "cs_delayed", "mode": "payment", "customer": "cus_1",
        "client_reference_id": str(user.id),
        "metadata": {"user_id": str(user.id), "credit_quantity": "3", "unit_price_cents": "80", "currency": "usd"},
        "amount_total": 240, "currency": "usd", "payment_intent": "pi_delayed",
    }
    current_event = {"id": "evt_pending", "type": "checkout.session.completed", "data": {"object": {**base_session, "payment_status": "unpaid"}}}
    monkeypatch.setattr(billing.settings, "STRIPE_WEBHOOK_SECRET", "whsec_test")
    monkeypatch.setattr(billing.stripe.Webhook, "construct_event", lambda *_args: current_event)
    db.scalar = AsyncMock(side_effect=[None, None])
    award = AsyncMock()
    monkeypatch.setattr(billing.credits_service, "award_onetime_credits_for_user", award)
    receipt_delay = MagicMock()
    monkeypatch.setitem(
        sys.modules, "tasks.email_tasks",
        types.SimpleNamespace(send_credit_purchase_receipt_task=SimpleNamespace(delay=receipt_delay)),
    )

    await billing.stripe_webhook(_Req(), db=db, redis=redis)
    pending = next(row for row in added if isinstance(row, billing.CreditPurchase))
    assert pending.status == "pending"
    award.assert_not_awaited()

    current_event = {"id": "evt_paid", "type": "checkout.session.async_payment_succeeded", "data": {"object": {**base_session, "payment_status": "paid"}}}
    db.scalar = AsyncMock(side_effect=[None, pending, 0])
    await billing.stripe_webhook(_Req(), db=db, redis=redis)
    assert pending.status == "completed"
    award.assert_awaited_once_with(db, user.id, 3, stripe_session_id="cs_delayed")

    current_event = {"id": "evt_paid_duplicate", "type": "checkout.session.async_payment_succeeded", "data": {"object": {**base_session, "payment_status": "paid"}}}
    db.scalar = AsyncMock(side_effect=[None, pending])
    await billing.stripe_webhook(_Req(), db=db, redis=redis)
    assert award.await_count == 1


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "event_types",
    [
        ("customer.subscription.updated", "customer.subscription.deleted"),
        ("invoice.payment_succeeded", "customer.subscription.paused"),
        ("invoice.payment_failed", "customer.subscription.updated"),
    ],
)
async def test_same_subscription_event_pairs_use_canonical_reconciliation(monkeypatch, event_types):
    current_event = None
    db = AsyncMock()
    db.add = MagicMock()
    db.scalar = AsyncMock(return_value=None)
    reconcile = AsyncMock(return_value=True)
    monkeypatch.setattr(billing.settings, "STRIPE_WEBHOOK_SECRET", "whsec_test")
    monkeypatch.setattr(billing, "_reconcile_canonical_subscription", reconcile)
    monkeypatch.setattr(billing.stripe.Webhook, "construct_event", lambda *_args: current_event)

    for index, event_type in enumerate(event_types):
        object_payload = {"subscription": "sub_shared"} if event_type.startswith("invoice.") else {"id": "sub_shared"}
        current_event = {
            "id": f"evt_pair_{index}_{event_type}",
            "type": event_type,
            "data": {"object": object_payload},
        }
        await billing.stripe_webhook(_Req(), db=db, redis=AsyncMock())

    assert reconcile.await_count == 2
    assert all(call.args[1] == "sub_shared" for call in reconcile.await_args_list)


@pytest.mark.asyncio
async def test_canonical_reconciliation_takes_subscription_lock_before_retrieve(monkeypatch):
    db = AsyncMock()
    lock = AsyncMock()
    sync = AsyncMock(return_value=True)
    canonical = {"id": "sub_1", "customer": "cus_1", "status": "paused"}
    monkeypatch.setattr(billing, "_acquire_business_lock", lock)
    monkeypatch.setattr(billing, "_sync_subscription_from_stripe_object", sync)
    monkeypatch.setattr(billing.asyncio, "to_thread", AsyncMock(return_value=canonical))

    await billing._reconcile_canonical_subscription(db, "sub_1", event_created_at=None)

    lock.assert_awaited_once_with(db, "stripe-subscription", "sub_1")
    sync.assert_awaited_once_with(
        db, canonical, event_created_at=None, _authoritative_tie=True, authoritative_snapshot=True,
    )


@pytest.mark.asyncio
async def test_older_subscription_event_cannot_regress_newer_state(monkeypatch):
    newer = billing.datetime.fromtimestamp(1_800_000_100, tz=billing.timezone.utc)
    older = billing.datetime.fromtimestamp(1_800_000_000, tz=billing.timezone.utc)
    user = SimpleNamespace(id=uuid4(), subscription_tier="free")
    plan = SimpleNamespace(id=uuid4(), slug="standard_15")
    existing = SimpleNamespace(
        stripe_subscription_id="sub_1",
        stripe_event_created_at=newer,
        status="canceled",
        current_period_end=newer,
    )
    db = AsyncMock()
    db.scalar = AsyncMock(side_effect=[user, plan, existing])
    db.add = MagicMock()
    monkeypatch.setattr(billing.settings, "STRIPE_PRICE_ID_STANDARD_MONTHLY", "price_standard")

    applied = await billing._sync_subscription_from_stripe_object(
        db,
        {
            "id": "sub_1",
            "customer": "cus_1",
            "status": "active",
            "items": {"data": [{"price": {"id": "price_standard"}}]},
        },
        event_created_at=older,
    )

    assert applied is False
    assert existing.status == "canceled"
    db.add.assert_not_called()


@pytest.mark.asyncio
async def test_same_second_subscription_events_reconcile_authoritative_stripe_state(monkeypatch):
    event_time = billing.datetime.fromtimestamp(1_800_000_000, tz=billing.timezone.utc)
    user = SimpleNamespace(id=uuid4(), subscription_tier="premium")
    plan = SimpleNamespace(id=uuid4(), slug="standard_15")
    existing = SimpleNamespace(
        stripe_subscription_id="sub_1",
        stripe_event_created_at=event_time,
        status="active",
        current_period_end=event_time,
        user_id=user.id,
        plan_id=plan.id,
    )
    db = AsyncMock()
    db.scalar = AsyncMock(side_effect=[user, plan, existing, user, plan, existing])
    db.add = MagicMock()
    monkeypatch.setattr(billing.settings, "STRIPE_SECRET_KEY", "sk_test")
    monkeypatch.setattr(billing.settings, "STRIPE_PRICE_ID_STANDARD_MONTHLY", "price_standard")
    monkeypatch.setattr(
        billing.asyncio,
        "to_thread",
        AsyncMock(return_value={
            "id": "sub_1",
            "customer": "cus_1",
            "status": "canceled",
            "current_period_end": 1_800_000_000,
            "items": {"data": [{"price": {"id": "price_standard"}}]},
        }),
    )

    applied = await billing._sync_subscription_from_stripe_object(
        db,
        {
            "id": "sub_1",
            "customer": "cus_1",
            "status": "active",
            "items": {"data": [{"price": {"id": "price_standard"}}]},
        },
        event_created_at=event_time,
    )

    assert applied is True
    assert existing.status == "canceled"


@pytest.mark.asyncio
async def test_webhook_existing_purchase_session_is_idempotent(monkeypatch):
    user = SimpleNamespace(id=uuid4(), email="u@example.com", full_name="User", stripe_customer_id=None)
    db = AsyncMock()
    db.add = lambda *_args, **_kwargs: None

    async def fake_execute(stmt):
        return _ExecResult(user)

    db.execute = fake_execute
    db.scalar = AsyncMock(side_effect=[None, SimpleNamespace(id=uuid4())])  # event claim, existing purchase
    db.commit = AsyncMock()
    redis = AsyncMock()
    redis.set = AsyncMock(return_value=True)

    monkeypatch.setattr(billing.settings, "STRIPE_WEBHOOK_SECRET", "whsec_test")
    monkeypatch.setattr(
        billing.stripe.Webhook,
        "construct_event",
        lambda payload, sig, secret: {
            "id": "evt_test_existing",
            "type": "checkout.session.completed",
            "data": {
                "object": {
                    "id": "cs_existing",
                    "mode": "payment",
                    "payment_status": "paid",
                    "customer": "cus_1",
                    "metadata": {
                        "user_id": str(user.id),
                        "credit_quantity": "3",
                        "unit_price_cents": "80",
                        "currency": "usd",
                    },
                    "amount_total": 240,
                    "currency": "usd",
                    "payment_intent": "pi_paid",
                }
            },
        },
    )

    award_mock = AsyncMock()
    monkeypatch.setattr(billing.credits_service, "award_onetime_credits_for_user", award_mock)

    out = await billing.stripe_webhook(_Req(), db=db, redis=redis)
    assert out == {"received": True}
    award_mock.assert_not_called()


@pytest.mark.asyncio
async def test_webhook_second_successful_purchase_triggers_upsell(monkeypatch):
    user = SimpleNamespace(id=uuid4(), email="u@example.com", full_name="User", stripe_customer_id=None)
    db = AsyncMock()
    db.add = lambda *_args, **_kwargs: None

    async def fake_execute(stmt):
        return _ExecResult(user)

    db.execute = fake_execute
    db.scalar = AsyncMock(side_effect=[None, None])  # event claim, existing purchase lookup
    db.flush = AsyncMock()
    db.commit = AsyncMock()
    redis = AsyncMock()
    redis.set = AsyncMock(return_value=True)

    monkeypatch.setattr(billing.settings, "STRIPE_WEBHOOK_SECRET", "whsec_test")
    monkeypatch.setattr(
        billing.stripe.Webhook,
        "construct_event",
        lambda payload, sig, secret: {
            "id": "evt_second_purchase",
            "type": "checkout.session.completed",
            "data": {
                "object": {
                    "id": "cs_paid_2",
                    "mode": "payment",
                    "payment_status": "paid",
                    "customer": "cus_1",
                    "metadata": {
                        "user_id": str(user.id),
                        "credit_quantity": "3",
                        "unit_price_cents": "80",
                        "currency": "usd",
                    },
                    "amount_total": 240,
                    "currency": "usd",
                    "payment_intent": "pi_paid_2",
                }
            },
        },
    )

    award_mock = AsyncMock()
    monkeypatch.setattr(billing.credits_service, "award_onetime_credits_for_user", award_mock)
    monkeypatch.setattr(billing, "_monthly_successful_purchase_count", AsyncMock(return_value=2))

    delay_mock = MagicMock()
    fake_task = SimpleNamespace(delay=delay_mock)
    fake_module = types.SimpleNamespace(
        send_second_purchase_upsell_task=fake_task,
        send_credit_purchase_receipt_task=SimpleNamespace(delay=MagicMock()),
    )
    monkeypatch.setitem(sys.modules, "tasks.email_tasks", fake_module)

    out = await billing.stripe_webhook(_Req(), db=db, redis=redis)
    assert out == {"received": True}
    award_mock.assert_called_once()
    delay_mock.assert_called_once()


@pytest.mark.asyncio
async def test_charge_refunded_duplicate_event_is_noop(monkeypatch):
    db = AsyncMock()
    db.scalar = AsyncMock(return_value=SimpleNamespace(status="succeeded"))
    redis = AsyncMock()

    monkeypatch.setattr(billing.settings, "STRIPE_WEBHOOK_SECRET", "whsec_test")
    monkeypatch.setattr(
        billing.stripe.Webhook, "construct_event",
        lambda *_args: {
            "id": "evt_refund_dup",
            "type": "charge.refunded",
            "data": {"object": {"id": "ch_dup", "amount": 500, "amount_refunded": 500, "payment_intent": "pi_dup"}},
        },
    )
    reverse_mock = AsyncMock()
    monkeypatch.setattr(billing.credits_service, "reverse_onetime_credits_for_user", reverse_mock)

    out = await billing.stripe_webhook(_Req(), db=db, redis=redis)
    assert out == {"received": True}
    reverse_mock.assert_not_called()


@pytest.mark.asyncio
async def test_charge_refunded_full_subscription_payment_revokes_access(monkeypatch):
    """A full refund of a subscription invoice charge revokes access now, not at period end."""
    user = SimpleNamespace(id=uuid4(), subscription_tier="student")
    billing_invoice = SimpleNamespace(stripe_subscription_id="sub_1")
    internal_sub = SimpleNamespace(
        user_id=user.id, status="active", current_period_end=None, stripe_subscription_id="sub_1",
    )
    db = AsyncMock()
    db.add = MagicMock()
    # billing-event claim, credit-purchase probe (miss), invoice->subscription
    # lookup, UserSubscription lookup, User lookup.
    db.scalar = AsyncMock(side_effect=[None, None, billing_invoice, internal_sub, user])
    db.commit = AsyncMock()
    redis = AsyncMock()

    monkeypatch.setattr(billing.settings, "STRIPE_WEBHOOK_SECRET", "whsec_test")
    monkeypatch.setattr(
        billing.stripe.Webhook, "construct_event",
        lambda *_args: {
            "id": "evt_refund_full_sub",
            "type": "charge.refunded",
            "data": {"object": {
                "id": "ch_1", "amount": 1500, "amount_refunded": 1500,
                "invoice": "in_1", "payment_intent": "pi_1", "currency": "usd",
            }},
        },
    )

    out = await billing.stripe_webhook(_Req(), db=db, redis=redis)

    assert out == {"received": True}
    assert internal_sub.status == "canceled"
    assert internal_sub.current_period_end is not None
    assert user.subscription_tier == "free"


@pytest.mark.asyncio
async def test_charge_refunded_partial_subscription_payment_keeps_access(monkeypatch):
    """A partial refund/adjustment on a subscription invoice does not revoke access."""
    billing_invoice = SimpleNamespace(stripe_subscription_id="sub_2")
    db = AsyncMock()
    db.add = MagicMock()
    db.scalar = AsyncMock(side_effect=[None, None, billing_invoice])
    db.commit = AsyncMock()
    redis = AsyncMock()

    monkeypatch.setattr(billing.settings, "STRIPE_WEBHOOK_SECRET", "whsec_test")
    monkeypatch.setattr(
        billing.stripe.Webhook, "construct_event",
        lambda *_args: {
            "id": "evt_refund_partial_sub",
            "type": "charge.refunded",
            "data": {"object": {
                "id": "ch_2", "amount": 1500, "amount_refunded": 500,
                "invoice": "in_2", "payment_intent": "pi_2", "currency": "usd",
            }},
        },
    )

    out = await billing.stripe_webhook(_Req(), db=db, redis=redis)

    assert out == {"received": True}
    # Only the billing-event claim, credit-purchase probe, and the
    # invoice->subscription lookup ran; no UserSubscription/User rows were touched.
    assert db.scalar.await_count == 3


@pytest.mark.asyncio
async def test_charge_refunded_full_subscription_resolves_via_customer_when_invoice_missing(monkeypatch):
    """Some Stripe API versions omit the invoice back-reference on Charge; fall
    back to the customer's current subscription (confirmed live against a real
    test-mode account whose Charge objects have no `invoice` field at all)."""
    user = SimpleNamespace(id=uuid4(), subscription_tier="student", stripe_customer_id="cus_1")
    latest_sub_row = SimpleNamespace(stripe_subscription_id="sub_3")
    internal_sub = SimpleNamespace(
        user_id=user.id, status="active", current_period_end=None, stripe_subscription_id="sub_3",
    )
    db = AsyncMock()
    db.add = MagicMock()
    # billing-event claim, credit-purchase probe (miss), user-by-customer lookup,
    # _latest_subscription_row, UserSubscription lookup by stripe_subscription_id.
    db.scalar = AsyncMock(side_effect=[None, None, user, latest_sub_row, internal_sub])
    db.commit = AsyncMock()
    redis = AsyncMock()

    monkeypatch.setattr(billing.settings, "STRIPE_WEBHOOK_SECRET", "whsec_test")
    monkeypatch.setattr(
        billing.stripe.Webhook, "construct_event",
        lambda *_args: {
            "id": "evt_refund_full_sub_no_invoice",
            "type": "charge.refunded",
            "data": {"object": {
                "id": "ch_3", "amount": 1500, "amount_refunded": 1500,
                "invoice": None, "payment_intent": "pi_3", "customer": "cus_1", "currency": "usd",
            }},
        },
    )

    out = await billing.stripe_webhook(_Req(), db=db, redis=redis)

    assert out == {"received": True}
    assert internal_sub.status == "canceled"
    assert internal_sub.current_period_end is not None
    assert user.subscription_tier == "free"


@pytest.mark.asyncio
async def test_charge_refunded_credit_purchase_partial_then_full_claws_back_incrementally(monkeypatch):
    """Sequential partial refunds on the same charge claw back proportionally without double-counting."""
    purchase_id = uuid4()
    user_id = uuid4()
    purchase = SimpleNamespace(
        id=purchase_id, user_id=user_id, quantity=10, status="completed",
        currency="usd", stripe_charge_id=None, notes=None,
    )
    db = AsyncMock()
    db.add = MagicMock()
    db.commit = AsyncMock()
    redis = AsyncMock()
    reverse_mock = AsyncMock()
    monkeypatch.setattr(billing.credits_service, "reverse_onetime_credits_for_user", reverse_mock)
    monkeypatch.setattr(billing.settings, "STRIPE_WEBHOOK_SECRET", "whsec_test")

    def _event(amount_refunded, event_id):
        return {
            "id": event_id,
            "type": "charge.refunded",
            "data": {"object": {
                "id": "ch_credit", "amount": 1000, "amount_refunded": amount_refunded,
                "invoice": None, "payment_intent": "pi_credit", "currency": "usd",
            }},
        }

    # First delivery: 40% refunded so far -> claw back round(10 * 0.4) = 4.
    monkeypatch.setattr(billing.stripe.Webhook, "construct_event", lambda *_args: _event(400, "evt_refund_credit_1"))
    db.scalar = AsyncMock(side_effect=[None, purchase, 0])
    await billing.stripe_webhook(_Req(), db=db, redis=redis)
    assert reverse_mock.await_args_list[0].args == (db, user_id, 4)
    assert purchase.status == "completed"

    # Second delivery: fully refunded now -> claw back the remaining round(10*1.0) - 4 = 6.
    monkeypatch.setattr(billing.stripe.Webhook, "construct_event", lambda *_args: _event(1000, "evt_refund_credit_2"))
    db.scalar = AsyncMock(side_effect=[None, purchase, 4])
    await billing.stripe_webhook(_Req(), db=db, redis=redis)
    assert reverse_mock.await_args_list[1].args == (db, user_id, 6)
    assert purchase.status == "refunded"

    assert reverse_mock.await_count == 2


@pytest.mark.asyncio
async def test_charge_refunded_credit_purchase_already_spent_still_claws_back_full_amount(monkeypatch):
    """A full refund claws back the entire granted amount regardless of how much was already spent.

    Every balance read in services/credits.py (get_user_balance, _split_pool_balances,
    get_credit_accounting_snapshot) floors at zero, so an over-clawback simply caps the
    user's effective purchased balance at zero instead of tracking a negative debt that
    blocks spending until resolved. This test documents that decision: the handler never
    checks current balance before writing the mirrored reversal entry.
    """
    purchase_id = uuid4()
    user_id = uuid4()
    purchase = SimpleNamespace(
        id=purchase_id, user_id=user_id, quantity=5, status="completed",
        currency="usd", stripe_charge_id=None, notes=None,
    )
    db = AsyncMock()
    db.add = MagicMock()
    db.scalar = AsyncMock(side_effect=[None, purchase, 0])
    db.commit = AsyncMock()
    redis = AsyncMock()
    reverse_mock = AsyncMock()
    monkeypatch.setattr(billing.credits_service, "reverse_onetime_credits_for_user", reverse_mock)
    monkeypatch.setattr(billing.settings, "STRIPE_WEBHOOK_SECRET", "whsec_test")
    monkeypatch.setattr(
        billing.stripe.Webhook, "construct_event",
        lambda *_args: {
            "id": "evt_refund_credit_spent",
            "type": "charge.refunded",
            "data": {"object": {
                "id": "ch_spent", "amount": 500, "amount_refunded": 500,
                "invoice": None, "payment_intent": "pi_spent", "currency": "usd",
            }},
        },
    )

    out = await billing.stripe_webhook(_Req(), db=db, redis=redis)

    assert out == {"received": True}
    reverse_mock.assert_awaited_once_with(
        db, user_id, 5,
        idempotency_key=f"stripe_refund:{purchase_id}:500",
        metadata={
            "credit_purchase_id": str(purchase_id),
            "stripe_charge_id": "ch_spent",
            "stripe_payment_intent_id": "pi_spent",
            "amount_refunded_cents": 500,
            "refund_fraction": 1.0,
        },
    )
    assert purchase.status == "refunded"
