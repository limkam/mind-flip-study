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
    assert 'regeneration' in out.actions
    assert 'create_book' in out.actions


@pytest.mark.asyncio
async def test_trial_eligibility_rejects_repeat_trial(monkeypatch):
    user = SimpleNamespace(
        id=uuid4(),
        subscription_tier='free',
        preferences={'trial': {'used_at': datetime.now(timezone.utc).isoformat()}},
    )
    db = AsyncMock()
    monkeypatch.setattr(billing.settings, 'TRIAL_ENABLED', True)
    monkeypatch.setattr(billing, '_trial_eligibility_signals', AsyncMock(return_value={
        'has_prior_subscription': False,
        'has_credit_purchase_history': False,
        'trial_used': True,
    }))

    out = await billing.trial_eligibility(current_user=user, db=db)
    assert out.eligible is False
    assert out.reason == 'trial_already_used'


@pytest.mark.asyncio
async def test_start_trial_rejects_ineligible_user(monkeypatch):
    user = SimpleNamespace(id=uuid4(), subscription_tier='free', preferences={})
    db = AsyncMock()

    monkeypatch.setattr(billing, 'trial_eligibility', AsyncMock(return_value=billing.TrialEligibilityResponse(eligible=False, reason='trial_already_used', signals={})))

    with pytest.raises(billing.HTTPException) as exc:
        await billing.start_trial_checkout(current_user=user, db=db)
    assert exc.value.status_code == 403
    assert exc.value.detail['code'] == 'TRIAL_NOT_ELIGIBLE'


@pytest.mark.asyncio
async def test_trial_conversion_updates_user_metadata(monkeypatch):
    user = SimpleNamespace(
        id=uuid4(),
        stripe_customer_id='cus_1',
        subscription_tier='free',
        preferences={},
    )
    plan = SimpleNamespace(id=uuid4(), slug='premium_30')
    internal_sub = SimpleNamespace(
        user_id=user.id,
        plan_id=plan.id,
        status='active',
        billing_interval=None,
        current_period_end=None,
    )

    db = AsyncMock()
    db.add = lambda *_args, **_kwargs: None

    monkeypatch.setattr(billing.settings, 'STRIPE_PRICE_ID_PREMIUM_MONTHLY', 'price_prem_m')

    db.scalar = AsyncMock(side_effect=[user, plan, internal_sub, user, plan, internal_sub])

    trialing_sub = {
        'id': 'sub_1',
        'customer': 'cus_1',
        'status': 'trialing',
        'current_period_end': 1793577600,
        'items': {'data': [{'price': {'id': 'price_prem_m'}}]},
    }
    active_sub = {
        'id': 'sub_1',
        'customer': 'cus_1',
        'status': 'active',
        'current_period_end': 1793577600,
        'items': {'data': [{'price': {'id': 'price_prem_m'}}]},
    }

    await billing._sync_subscription_from_stripe_object(db, trialing_sub)
    assert user.preferences.get('trial', {}).get('started_at') is not None

    await billing._sync_subscription_from_stripe_object(db, active_sub)
    assert user.preferences.get('trial', {}).get('used_at') is not None
    assert user.subscription_tier == 'premium'


@pytest.mark.asyncio
async def test_cancel_at_period_end_does_not_create_charge(monkeypatch):
    user = SimpleNamespace(id=uuid4())
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
    modify_mock = MagicMock()
    monkeypatch.setattr(billing.stripe.Subscription, 'modify', modify_mock)

    out = await billing.cancel_subscription_at_period_end(current_user=user, db=db)
    assert out.canceled_at_period_end is True
    modify_mock.assert_called_once_with('sub_1', cancel_at_period_end=True)
    assert sub.status == 'canceled'


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
    monkeypatch.setattr(billing.settings, 'MOBILE_CHECKOUT_SUCCESS_URL', 'https://app.mindflip.io/mobile/billing/success')
    monkeypatch.setattr(billing.settings, 'MOBILE_CHECKOUT_CANCEL_URL', 'https://app.mindflip.io/mobile/billing/cancel')

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
    assert 'app.mindflip.io/mobile/billing/success' in captured['success_url']
    assert '{CHECKOUT_SESSION_ID}' in captured['success_url']
    assert captured['cancel_url'] == 'https://app.mindflip.io/mobile/billing/cancel'


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
    monkeypatch.setattr(billing.settings, 'FRONTEND_URL', 'https://mindflip.io')

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
    assert 'mindflip.io/billing/success' in captured['success_url']
    assert captured['cancel_url'] == 'https://mindflip.io/billing/cancel'


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

    result = await billing.verify_checkout_session(
        session_id='cs_test_valid', current_user=user, db=db,
    )
    assert result.session_id == 'cs_test_valid'
    assert result.checkout_status == 'complete'
    assert result.subscription_state == 'active'
    assert result.plan_slug == 'standard_15'
    assert result.interval == 'monthly'


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
