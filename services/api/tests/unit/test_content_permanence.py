from unittest.mock import AsyncMock

import pytest

import routers.billing as billing


class _Req:
    def __init__(self, event):
        self.headers = {'stripe-signature': 'sig'}
        self._event = event

    async def body(self):
        return b'{}'


@pytest.fixture(autouse=True)
def _isolate_stripe_reconciliation(monkeypatch):
    """These unit tests must never perform provider I/O."""
    monkeypatch.setattr(
        billing,
        '_reconcile_canonical_subscription',
        AsyncMock(return_value=None),
    )


@pytest.mark.asyncio
async def test_paid_to_free_downgrade_never_deletes_content(monkeypatch):
    event = {
        'id': 'evt_sub_deleted_1',
        'type': 'customer.subscription.deleted',
        'data': {'object': {'id': 'sub_1', 'customer': 'cus_1'}},
    }
    db = AsyncMock()
    db.commit = AsyncMock()
    db.delete = AsyncMock()
    redis = AsyncMock()
    redis.set = AsyncMock(return_value=True)

    monkeypatch.setattr(billing.settings, 'STRIPE_WEBHOOK_SECRET', 'whsec_test')
    monkeypatch.setattr(billing.stripe.Webhook, 'construct_event', lambda payload, sig, secret: event)
    monkeypatch.setattr(billing, '_sync_subscription_from_stripe_object', AsyncMock(return_value=None))

    out = await billing.stripe_webhook(_Req(event), db=db, redis=redis)
    assert out == {'received': True}
    db.delete.assert_not_called()


@pytest.mark.asyncio
async def test_canceled_subscription_path_preserves_existing_content(monkeypatch):
    event = {
        'id': 'evt_sub_updated_cancel',
        'type': 'customer.subscription.updated',
        'data': {'object': {'id': 'sub_1', 'customer': 'cus_1', 'status': 'canceled'}},
    }
    db = AsyncMock()
    db.commit = AsyncMock()
    db.delete = AsyncMock()
    redis = AsyncMock()
    redis.set = AsyncMock(return_value=True)

    monkeypatch.setattr(billing.settings, 'STRIPE_WEBHOOK_SECRET', 'whsec_test')
    monkeypatch.setattr(billing.stripe.Webhook, 'construct_event', lambda payload, sig, secret: event)
    monkeypatch.setattr(billing, '_sync_subscription_from_stripe_object', AsyncMock(return_value=None))

    out = await billing.stripe_webhook(_Req(event), db=db, redis=redis)
    assert out == {'received': True}
    db.delete.assert_not_called()


@pytest.mark.asyncio
async def test_expired_trial_path_preserves_existing_content(monkeypatch):
    event = {
        'id': 'evt_sub_expired_trial',
        'type': 'customer.subscription.updated',
        'data': {'object': {'id': 'sub_1', 'customer': 'cus_1', 'status': 'incomplete_expired'}},
    }
    db = AsyncMock()
    db.commit = AsyncMock()
    db.delete = AsyncMock()
    redis = AsyncMock()
    redis.set = AsyncMock(return_value=True)

    monkeypatch.setattr(billing.settings, 'STRIPE_WEBHOOK_SECRET', 'whsec_test')
    monkeypatch.setattr(billing.stripe.Webhook, 'construct_event', lambda payload, sig, secret: event)
    monkeypatch.setattr(billing, '_sync_subscription_from_stripe_object', AsyncMock(return_value=None))

    out = await billing.stripe_webhook(_Req(event), db=db, redis=redis)
    assert out == {'received': True}
    db.delete.assert_not_called()
