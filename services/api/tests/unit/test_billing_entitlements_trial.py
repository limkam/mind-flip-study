import sys
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

import routers.billing as billing


class _ExecResult:
    def __init__(self, user):
        self._user = user

    def scalar_one(self):
        return self._user


@pytest.mark.asyncio
async def test_billing_pricing_returns_backend_configured_amounts(monkeypatch):
    monkeypatch.setattr(billing.settings, 'BILLING_DEFAULT_INTERVAL', 'monthly')
    monkeypatch.setattr(billing.settings, 'BILLING_PRICE_CENTS_QUICK_MONTHLY', 399)
    monkeypatch.setattr(billing.settings, 'BILLING_PRICE_CENTS_STANDARD_MONTHLY', 699)
    monkeypatch.setattr(billing.settings, 'BILLING_PRICE_CENTS_PREMIUM_MONTHLY', 899)
    monkeypatch.setattr(billing.settings, 'BILLING_PRICE_CENTS_QUICK_ANNUAL', 2400)
    monkeypatch.setattr(billing.settings, 'BILLING_PRICE_CENTS_STANDARD_ANNUAL', 4200)
    monkeypatch.setattr(billing.settings, 'BILLING_PRICE_CENTS_PREMIUM_ANNUAL', 5400)

    out = await billing.billing_pricing()
    assert out.default_interval == 'monthly'
    assert out.plans['quick_72'].monthly_price_cents == 399
    assert out.plans['standard_15'].monthly_price_cents == 699
    assert out.plans['premium_30'].monthly_price_cents == 899
    assert out.plans['quick_72'].annual_price_cents == 2400
    assert out.plans['standard_15'].annual_price_cents == 4200
    assert out.plans['premium_30'].annual_price_cents == 5400


@pytest.mark.asyncio
async def test_entitlements_snapshot_contains_raw_fields(monkeypatch):
    user = SimpleNamespace(id=uuid4())
    db = AsyncMock()

    monkeypatch.setattr(billing.entitlements_service, '_user_plan_slug', AsyncMock(return_value='standard_15'))
    monkeypatch.setattr(billing.entitlements_service, '_plan_features', AsyncMock(return_value={'daily_review_limit': 20}))
    monkeypatch.setattr(billing.credits_service, '_split_pool_balances', AsyncMock(side_effect=[(3, 7), (1, 0)]))
    monkeypatch.setattr(billing.credits_service, 'get_credit_accounting_snapshot', AsyncMock(return_value={
        'available_total': 10,
        'plan': {'allocated': 5, 'used': 2, 'remaining': 3},
        'purchased': {'purchased_total': 9, 'used': 2, 'remaining': 7},
    }))
    monkeypatch.setattr(
        billing.entitlements_service,
        'can_user_do',
        AsyncMock(return_value={'allowed': True, 'reason': None, 'upgrade_hook': None, 'consume': None}),
    )
    monkeypatch.setattr(billing, '_latest_subscription_row', AsyncMock(return_value=SimpleNamespace(status='active', billing_interval='annual', current_period_end=None)))

    out = await billing.billing_entitlements_snapshot(current_user=user, db=db)
    assert out.plan_slug == 'standard_15'
    assert out.subscription_status == 'active'
    assert out.billing_interval == 'annual'
    assert out.balances.monthly_content_credits == 3
    assert out.balances.purchased_credits == 7
    assert out.balances.monthly_regen_credits == 1
    assert out.balances.available_total == 10
    assert out.balances.purchased_total_credits == 9
    assert out.balances.purchased_used_credits == 2
    assert 'regeneration' in out.actions
    assert 'create_book' in out.actions
    assert 'activate_shared_content' in out.actions


@pytest.mark.asyncio
async def test_cancel_at_period_end_does_not_create_charge(monkeypatch):
    user = SimpleNamespace(id=uuid4(), email='a@b.com', full_name='User')
    sub = SimpleNamespace(
        stripe_subscription_id='sub_1',
        status='active',
        current_period_end=datetime.now(timezone.utc),
    )
    db = AsyncMock()
    db.scalar = AsyncMock(return_value=sub)
    db.commit = AsyncMock()
    db.add = lambda *_args, **_kwargs: None

    monkeypatch.setattr(billing.settings, 'STRIPE_SECRET_KEY', 'sk_test')
    monkeypatch.setattr(billing, '_resolve_stripe_subscription', AsyncMock(return_value={
        'state': 'active', 'subscription': {'id': 'sub_1'}, 'count': 1,
    }))
    modify_mock = AsyncMock()
    monkeypatch.setattr(billing.asyncio, 'to_thread', modify_mock)
    cancel_email_mock = SimpleNamespace(delay=MagicMock())
    monkeypatch.setitem(
        sys.modules, 'tasks.email_tasks',
        SimpleNamespace(send_cancellation_confirmation_task=cancel_email_mock),
    )

    out = await billing.cancel_subscription_at_period_end(current_user=user, db=db)
    assert out.canceled_at_period_end is True
    # cancellation also looks up the subscription's final invoice (for the
    # confirmation email's optional PDF attachment) via the same asyncio.to_thread
    # mock, so find the Subscription.modify call specifically rather than assuming
    # it's the last one.
    modify_calls = [
        call for call in modify_mock.await_args_list
        if call.kwargs == {'cancel_at_period_end': True}
    ]
    assert len(modify_calls) == 1
    assert modify_calls[0].args[1:] == ('sub_1',)
    assert sub.status == 'canceled'
    cancel_email_mock.delay.assert_called_once()


# --- PAR-032: Checkout client URL selection ---

@pytest.mark.asyncio
async def test_checkout_mobile_client_uses_configured_mobile_urls(monkeypatch):
    """client=mobile should produce Stripe session with MOBILE_CHECKOUT_SUCCESS/CANCEL_URL."""
    uid = uuid4()
    user = SimpleNamespace(id=uid, email='a@b.com', stripe_customer_id='cus_1')

    db = AsyncMock()
    db.execute = AsyncMock(return_value=_ExecResult(user))
    db.commit = AsyncMock()
    db.refresh = AsyncMock()

    monkeypatch.setattr(billing.settings, 'STRIPE_SECRET_KEY', 'sk_test')
    monkeypatch.setattr(billing.settings, 'STRIPE_PRICE_ID_STANDARD_MONTHLY', 'price_std_m')
    monkeypatch.setattr(billing.settings, 'MOBILE_CHECKOUT_SUCCESS_URL', 'https://app.bilkeys.io/mobile/billing/success')
    monkeypatch.setattr(billing.settings, 'MOBILE_CHECKOUT_CANCEL_URL', 'https://app.bilkeys.io/mobile/billing/cancel')

    monkeypatch.setattr(billing, '_resolve_stripe_subscription', AsyncMock(return_value={
        'state': 'none', 'subscription': None, 'count': 0,
    }))

    captured = {}
    def mock_create(**kwargs):
        captured.update(kwargs)
        return SimpleNamespace(url='https://checkout.stripe.com/test', id='cs_test_1')
    monkeypatch.setattr(billing.stripe.checkout.Session, 'create', mock_create)

    result = await billing.create_checkout_session(
        current_user=user, db=db,
        plan=billing.BillingPlan.standard, interval=billing.BillingInterval.monthly,
        client=billing.CheckoutClient.mobile,
    )
    assert result.checkout_url == 'https://checkout.stripe.com/test'
    assert 'app.bilkeys.io/mobile/billing/success' in captured['success_url']
    assert '{CHECKOUT_SESSION_ID}' in captured['success_url']
    assert captured['cancel_url'] == 'https://app.bilkeys.io/mobile/billing/cancel'


@pytest.mark.asyncio
async def test_checkout_web_client_uses_frontend_urls(monkeypatch):
    """client=web (default) should produce Stripe session with FRONTEND_URL-based URLs."""
    uid = uuid4()
    user = SimpleNamespace(id=uid, email='a@b.com', stripe_customer_id='cus_1')

    db = AsyncMock()
    db.execute = AsyncMock(return_value=_ExecResult(user))
    db.commit = AsyncMock()
    db.refresh = AsyncMock()

    monkeypatch.setattr(billing.settings, 'STRIPE_SECRET_KEY', 'sk_test')
    monkeypatch.setattr(billing.settings, 'STRIPE_PRICE_ID_STANDARD_MONTHLY', 'price_std_m')
    monkeypatch.setattr(billing.settings, 'FRONTEND_URL', 'https://bilkeys.io')

    monkeypatch.setattr(billing, '_resolve_stripe_subscription', AsyncMock(return_value={
        'state': 'none', 'subscription': None, 'count': 0,
    }))

    captured = {}
    def mock_create(**kwargs):
        captured.update(kwargs)
        return SimpleNamespace(url='https://checkout.stripe.com/test', id='cs_test_2')
    monkeypatch.setattr(billing.stripe.checkout.Session, 'create', mock_create)

    result = await billing.create_checkout_session(
        current_user=user, db=db,
        plan=billing.BillingPlan.standard, interval=billing.BillingInterval.monthly,
        client=billing.CheckoutClient.web,
    )
    assert 'bilkeys.io/billing/success' in captured['success_url']
    assert captured['cancel_url'] == 'https://bilkeys.io/billing/cancel'


@pytest.mark.asyncio
async def test_checkout_default_client_is_web(monkeypatch):
    """Default client parameter should be web, producing FRONTEND_URL-based URLs."""
    uid = uuid4()
    user = SimpleNamespace(id=uid, email='a@b.com', stripe_customer_id='cus_1')

    db = AsyncMock()
    db.execute = AsyncMock(return_value=_ExecResult(user))
    db.commit = AsyncMock()
    db.refresh = AsyncMock()

    monkeypatch.setattr(billing.settings, 'STRIPE_SECRET_KEY', 'sk_test')
    monkeypatch.setattr(billing.settings, 'STRIPE_PRICE_ID_STANDARD_MONTHLY', 'price_std_m')
    monkeypatch.setattr(billing.settings, 'FRONTEND_URL', 'http://localhost:5173')

    monkeypatch.setattr(billing, '_resolve_stripe_subscription', AsyncMock(return_value={
        'state': 'none', 'subscription': None, 'count': 0,
    }))

    captured = {}
    def mock_create(**kwargs):
        captured.update(kwargs)
        return SimpleNamespace(url='https://checkout.stripe.com/test', id='cs_test_3')
    monkeypatch.setattr(billing.stripe.checkout.Session, 'create', mock_create)

    # Default client parameter
    result = await billing.create_checkout_session(
        current_user=user, db=db,
        plan=billing.BillingPlan.standard, interval=billing.BillingInterval.monthly,
    )
    assert 'localhost:5173/billing/success' in captured['success_url']
    assert captured['cancel_url'] == 'http://localhost:5173/billing/cancel'


# --- PAR-032: Session verification ---

class _FakeStripeObject:
    """Mimics the real stripe.StripeObject shape: attribute access works but
    there is no real dict-like .get() method. Every other test in this file
    mocks Session.retrieve with a plain dict, which masked a live bug where
    verify_checkout_session called session.get(...) directly on the real SDK
    return value and 500'd on every real checkout (confirmed via live test)."""

    def __init__(self, data):
        self._data = data

    def __getattr__(self, name):
        try:
            return self._data[name]
        except KeyError:
            raise AttributeError(name) from None

    def to_dict_recursive(self, for_json=False):
        return dict(self._data)


@pytest.mark.asyncio
async def test_verify_session_handles_real_stripe_object_not_dict(monkeypatch):
    """verify_checkout_session must work against the real (non-dict) SDK return type."""
    uid = uuid4()
    user = SimpleNamespace(id=uid, stripe_customer_id='cus_1')

    monkeypatch.setattr(billing.settings, 'STRIPE_SECRET_KEY', 'sk_test')
    monkeypatch.setattr(
        billing.stripe.checkout.Session, 'retrieve',
        lambda sid: _FakeStripeObject({
            'status': 'complete', 'mode': 'subscription', 'client_reference_id': str(uid), 'customer': 'cus_1',
            'metadata': {'user_id': str(uid), 'plan_slug': 'standard_15', 'interval': 'monthly'},
        }),
    )

    db = AsyncMock()
    monkeypatch.setattr(billing, '_resolve_stripe_subscription', AsyncMock(return_value={
        'state': 'active', 'subscription': {'id': 'sub_1'}, 'count': 1,
    }))
    monkeypatch.setattr(billing, '_sync_subscription_from_stripe_object', AsyncMock(return_value=True))

    result = await billing.verify_checkout_session(
        session_id='cs_test_real_object', current_user=user, db=db,
    )
    assert result.checkout_status == 'complete'
    assert result.subscription_state == 'active'
    assert result.plan_slug == 'standard_15'


@pytest.mark.asyncio
async def test_verify_session_valid_completed_active(monkeypatch):
    """Completed session owned by current user with active subscription → active."""
    uid = uuid4()
    user = SimpleNamespace(id=uid, stripe_customer_id='cus_1')

    monkeypatch.setattr(billing.settings, 'STRIPE_SECRET_KEY', 'sk_test')
    monkeypatch.setattr(billing.stripe.checkout.Session, 'retrieve', lambda sid: {
        'status': 'complete', 'client_reference_id': str(uid),
        'metadata': {'user_id': str(uid), 'plan_slug': 'standard_15', 'interval': 'monthly'},
    })

    db = AsyncMock()
    monkeypatch.setattr(billing, '_resolve_stripe_subscription', AsyncMock(return_value={
        'state': 'active', 'subscription': {'id': 'sub_1'}, 'count': 1,
    }))
    sync = AsyncMock(return_value=True)
    monkeypatch.setattr(billing, '_sync_subscription_from_stripe_object', sync)

    result = await billing.verify_checkout_session(
        session_id='cs_test_valid', current_user=user, db=db,
    )
    assert result.session_id == 'cs_test_valid'
    assert result.checkout_status == 'complete'
    assert result.subscription_state == 'active'
    assert result.plan_slug == 'standard_15'
    assert result.interval == 'monthly'
    sync.assert_awaited_once_with(db, {'id': 'sub_1'}, authoritative_snapshot=True)
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_verify_session_mismatched_user_rejected(monkeypatch):
    """Session belonging to a different user → 403."""
    uid = uuid4()
    other_uid = uuid4()
    user = SimpleNamespace(id=uid, stripe_customer_id='cus_1')

    monkeypatch.setattr(billing.settings, 'STRIPE_SECRET_KEY', 'sk_test')
    monkeypatch.setattr(billing.stripe.checkout.Session, 'retrieve', lambda sid: {
        'status': 'complete', 'client_reference_id': str(other_uid),
        'metadata': {'user_id': str(other_uid)},
    })

    db = AsyncMock()

    with pytest.raises(billing.HTTPException) as exc:
        await billing.verify_checkout_session(
            session_id='cs_test_wrong', current_user=user, db=db,
        )
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_verify_session_expired_returns_expired(monkeypatch):
    """Expired session → checkout_status=expired, subscription_state=not_confirmed."""
    uid = uuid4()
    user = SimpleNamespace(id=uid, stripe_customer_id='cus_1')

    monkeypatch.setattr(billing.settings, 'STRIPE_SECRET_KEY', 'sk_test')
    monkeypatch.setattr(billing.stripe.checkout.Session, 'retrieve', lambda sid: {
        'status': 'expired', 'client_reference_id': str(uid),
        'metadata': {'user_id': str(uid), 'plan_slug': 'premium_30', 'interval': 'annual'},
    })

    db = AsyncMock()
    monkeypatch.setattr(billing, '_resolve_stripe_subscription', AsyncMock(return_value={
        'state': 'none', 'subscription': None, 'count': 0,
    }))

    result = await billing.verify_checkout_session(
        session_id='cs_test_expired', current_user=user, db=db,
    )
    assert result.checkout_status == 'expired'
    assert result.subscription_state == 'not_confirmed'


@pytest.mark.asyncio
async def test_verify_session_invalid_id_format_rejected(monkeypatch):
    """Invalid session ID format → 400."""
    uid = uuid4()
    user = SimpleNamespace(id=uid)

    monkeypatch.setattr(billing.settings, 'STRIPE_SECRET_KEY', 'sk_test')
    db = AsyncMock()

    with pytest.raises(billing.HTTPException) as exc:
        await billing.verify_checkout_session(
            session_id='invalid_format', current_user=user, db=db,
        )
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_verify_session_conflict_state(monkeypatch):
    """Completed session with subscription conflict → subscription_state=conflict."""
    uid = uuid4()
    user = SimpleNamespace(id=uid, stripe_customer_id='cus_1')

    monkeypatch.setattr(billing.settings, 'STRIPE_SECRET_KEY', 'sk_test')
    monkeypatch.setattr(billing.stripe.checkout.Session, 'retrieve', lambda sid: {
        'status': 'complete', 'client_reference_id': str(uid),
        'metadata': {'user_id': str(uid), 'plan_slug': 'standard_15', 'interval': 'monthly'},
    })

    db = AsyncMock()
    monkeypatch.setattr(billing, '_resolve_stripe_subscription', AsyncMock(return_value={
        'state': 'subscription_conflict', 'subscription': None, 'count': 2,
    }))

    result = await billing.verify_checkout_session(
        session_id='cs_test_conflict', current_user=user, db=db,
    )
    assert result.checkout_status == 'complete'
    assert result.subscription_state == 'conflict'


@pytest.mark.asyncio
async def test_verify_session_complete_processing(monkeypatch):
    """Completed session but no active subscription yet → processing (webhook delay)."""
    uid = uuid4()
    user = SimpleNamespace(id=uid, stripe_customer_id='cus_1')

    monkeypatch.setattr(billing.settings, 'STRIPE_SECRET_KEY', 'sk_test')
    monkeypatch.setattr(billing.stripe.checkout.Session, 'retrieve', lambda sid: {
        'status': 'complete', 'client_reference_id': str(uid),
        'metadata': {'user_id': str(uid), 'plan_slug': 'quick_72', 'interval': 'annual'},
    })

    db = AsyncMock()
    monkeypatch.setattr(billing, '_resolve_stripe_subscription', AsyncMock(return_value={
        'state': 'none', 'subscription': None, 'count': 0,
    }))

    result = await billing.verify_checkout_session(
        session_id='cs_test_processing', current_user=user, db=db,
    )
    assert result.checkout_status == 'complete'
    assert result.subscription_state == 'processing'
    assert result.plan_slug == 'quick_72'
    assert result.interval == 'annual'


@pytest.mark.asyncio
async def test_verify_session_stripe_error_returns_404(monkeypatch):
    """Stripe retrieval error → 404."""
    uid = uuid4()
    user = SimpleNamespace(id=uid, stripe_customer_id='cus_1')

    monkeypatch.setattr(billing.settings, 'STRIPE_SECRET_KEY', 'sk_test')
    def mock_retrieve(sid):
        raise Exception("Stripe error")
    monkeypatch.setattr(billing.stripe.checkout.Session, 'retrieve', mock_retrieve)

    db = AsyncMock()

    with pytest.raises(billing.HTTPException) as exc:
        await billing.verify_checkout_session(
            session_id='cs_test_unknown', current_user=user, db=db,
        )
    assert exc.value.status_code == 404


# --- Hardening tests for Ownership & Error Classification ---

@pytest.mark.asyncio
async def test_verify_session_client_ref_matches_metadata_differs_rejected(monkeypatch):
    """client_reference_id matches user but metadata.user_id points to another user -> 403."""
    uid = uuid4()
    other_uid = uuid4()
    user = SimpleNamespace(id=uid, stripe_customer_id='cus_1')

    monkeypatch.setattr(billing.settings, 'STRIPE_SECRET_KEY', 'sk_test')
    monkeypatch.setattr(billing.stripe.checkout.Session, 'retrieve', lambda sid: {
        'status': 'complete', 'client_reference_id': str(uid),
        'metadata': {'user_id': str(other_uid)},
    })
    db = AsyncMock()

    with pytest.raises(billing.HTTPException) as exc:
        await billing.verify_checkout_session(session_id='cs_test_mismatch1', current_user=user, db=db)
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_verify_session_metadata_matches_client_ref_differs_rejected(monkeypatch):
    """metadata.user_id matches user but client_reference_id points to another user -> 403."""
    uid = uuid4()
    other_uid = uuid4()
    user = SimpleNamespace(id=uid, stripe_customer_id='cus_1')

    monkeypatch.setattr(billing.settings, 'STRIPE_SECRET_KEY', 'sk_test')
    monkeypatch.setattr(billing.stripe.checkout.Session, 'retrieve', lambda sid: {
        'status': 'complete', 'client_reference_id': str(other_uid),
        'metadata': {'user_id': str(uid)},
    })
    db = AsyncMock()

    with pytest.raises(billing.HTTPException) as exc:
        await billing.verify_checkout_session(session_id='cs_test_mismatch2', current_user=user, db=db)
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_verify_session_legacy_only_client_ref_present(monkeypatch):
    """Legacy session with only client_reference_id present -> PASS if matches."""
    uid = uuid4()
    user = SimpleNamespace(id=uid, stripe_customer_id='cus_1')

    monkeypatch.setattr(billing.settings, 'STRIPE_SECRET_KEY', 'sk_test')
    monkeypatch.setattr(billing.stripe.checkout.Session, 'retrieve', lambda sid: {
        'status': 'complete', 'client_reference_id': str(uid), 'metadata': {},
    })
    db = AsyncMock()
    monkeypatch.setattr(billing, '_resolve_stripe_subscription', AsyncMock(return_value={
        'state': 'active', 'subscription': {'id': 'sub_1'}, 'count': 1,
    }))
    monkeypatch.setattr(billing, '_sync_subscription_from_stripe_object', AsyncMock(return_value=True))

    result = await billing.verify_checkout_session(session_id='cs_test_legacy_ref', current_user=user, db=db)
    assert result.subscription_state == 'active'


@pytest.mark.asyncio
async def test_verify_session_legacy_only_metadata_user_present(monkeypatch):
    """Legacy session with only metadata user_id present -> PASS if matches."""
    uid = uuid4()
    user = SimpleNamespace(id=uid, stripe_customer_id='cus_1')

    monkeypatch.setattr(billing.settings, 'STRIPE_SECRET_KEY', 'sk_test')
    monkeypatch.setattr(billing.stripe.checkout.Session, 'retrieve', lambda sid: {
        'status': 'complete', 'client_reference_id': None, 'metadata': {'user_id': str(uid)},
    })
    db = AsyncMock()
    monkeypatch.setattr(billing, '_resolve_stripe_subscription', AsyncMock(return_value={
        'state': 'active', 'subscription': {'id': 'sub_1'}, 'count': 1,
    }))
    monkeypatch.setattr(billing, '_sync_subscription_from_stripe_object', AsyncMock(return_value=True))

    result = await billing.verify_checkout_session(session_id='cs_test_legacy_meta', current_user=user, db=db)
    assert result.subscription_state == 'active'


@pytest.mark.asyncio
async def test_verify_session_neither_ownership_field_present_rejected(monkeypatch):
    """Session with neither client_reference_id nor metadata user_id -> 403."""
    uid = uuid4()
    user = SimpleNamespace(id=uid, stripe_customer_id='cus_1')

    monkeypatch.setattr(billing.settings, 'STRIPE_SECRET_KEY', 'sk_test')
    monkeypatch.setattr(billing.stripe.checkout.Session, 'retrieve', lambda sid: {
        'status': 'complete', 'client_reference_id': None, 'metadata': {},
    })
    db = AsyncMock()

    with pytest.raises(billing.HTTPException) as exc:
        await billing.verify_checkout_session(session_id='cs_test_no_owner', current_user=user, db=db)
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_verify_session_customer_id_mismatch_rejected(monkeypatch):
    """Session customer matches different customer ID than user's stripe_customer_id -> 403."""
    uid = uuid4()
    user = SimpleNamespace(id=uid, stripe_customer_id='cus_known_user')

    monkeypatch.setattr(billing.settings, 'STRIPE_SECRET_KEY', 'sk_test')
    monkeypatch.setattr(billing.stripe.checkout.Session, 'retrieve', lambda sid: {
        'status': 'complete', 'client_reference_id': str(uid),
        'metadata': {'user_id': str(uid)}, 'customer': 'cus_different_user',
    })
    db = AsyncMock()

    with pytest.raises(billing.HTTPException) as exc:
        await billing.verify_checkout_session(session_id='cs_test_cust_mismatch', current_user=user, db=db)
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_verify_session_customer_present_first_time_user_without_customer_id(monkeypatch):
    """First-time subscriber with customer present on session but no saved stripe_customer_id -> PASS."""
    uid = uuid4()
    user = SimpleNamespace(id=uid, stripe_customer_id=None)

    monkeypatch.setattr(billing.settings, 'STRIPE_SECRET_KEY', 'sk_test')
    monkeypatch.setattr(billing.stripe.checkout.Session, 'retrieve', lambda sid: {
        'status': 'complete', 'client_reference_id': str(uid),
        'metadata': {'user_id': str(uid)}, 'customer': 'cus_new_user',
    })
    db = AsyncMock()
    monkeypatch.setattr(billing, '_resolve_stripe_subscription', AsyncMock(return_value={
        'state': 'active', 'subscription': {'id': 'sub_1'}, 'count': 1,
    }))
    monkeypatch.setattr(billing, '_sync_subscription_from_stripe_object', AsyncMock(return_value=True))

    result = await billing.verify_checkout_session(session_id='cs_test_first_time', current_user=user, db=db)
    assert result.subscription_state == 'active'


@pytest.mark.asyncio
async def test_verify_session_waits_when_local_subscription_sync_fails(monkeypatch):
    """Never show activation success while the pricing-page projection is still stale."""
    uid = uuid4()
    user = SimpleNamespace(id=uid, stripe_customer_id='cus_1')

    monkeypatch.setattr(billing.settings, 'STRIPE_SECRET_KEY', 'sk_test')
    monkeypatch.setattr(billing.stripe.checkout.Session, 'retrieve', lambda sid: {
        'status': 'complete', 'client_reference_id': str(uid),
        'metadata': {'user_id': str(uid), 'plan_slug': 'premium_30', 'interval': 'monthly'},
    })
    db = AsyncMock()
    monkeypatch.setattr(billing, '_resolve_stripe_subscription', AsyncMock(return_value={
        'state': 'active', 'subscription': {'id': 'sub_1'}, 'count': 1,
    }))
    monkeypatch.setattr(billing, '_sync_subscription_from_stripe_object', AsyncMock(return_value=False))

    result = await billing.verify_checkout_session('cs_test_sync_pending', user, db)

    assert result.subscription_state == 'processing'
    db.commit.assert_not_awaited()
    db.rollback.assert_awaited_once()


@pytest.mark.asyncio
async def test_verify_session_stripe_auth_error_returns_503(monkeypatch):
    """Stripe AuthenticationError -> 503 configuration error."""
    uid = uuid4()
    user = SimpleNamespace(id=uid, stripe_customer_id='cus_1')

    monkeypatch.setattr(billing.settings, 'STRIPE_SECRET_KEY', 'sk_test')
    def mock_retrieve(sid):
        raise billing.stripe.error.AuthenticationError("Invalid API key")
    monkeypatch.setattr(billing.stripe.checkout.Session, 'retrieve', mock_retrieve)
    db = AsyncMock()

    with pytest.raises(billing.HTTPException) as exc:
        await billing.verify_checkout_session(session_id='cs_test_auth_err', current_user=user, db=db)
    assert exc.value.status_code == 503
    assert exc.value.detail == "Stripe billing configuration error"


@pytest.mark.asyncio
async def test_verify_session_stripe_transient_error_returns_503(monkeypatch):
    """Stripe APIConnectionError -> 503 transient service error."""
    uid = uuid4()
    user = SimpleNamespace(id=uid, stripe_customer_id='cus_1')

    monkeypatch.setattr(billing.settings, 'STRIPE_SECRET_KEY', 'sk_test')
    def mock_retrieve(sid):
        raise billing.stripe.error.APIConnectionError("Connection timeout")
    monkeypatch.setattr(billing.stripe.checkout.Session, 'retrieve', mock_retrieve)
    db = AsyncMock()

    with pytest.raises(billing.HTTPException) as exc:
        await billing.verify_checkout_session(session_id='cs_test_transient_err', current_user=user, db=db)
    assert exc.value.status_code == 503
    assert exc.value.detail == "Checkout verification service temporarily unavailable"
