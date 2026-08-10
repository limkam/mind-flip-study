import pytest
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

from services.refill_job import award_for_all_subscriptions


class _Plan:
    def __init__(self, slug, content, regen, plan_id=None):
        self.id = plan_id or uuid4()
        self.slug = slug
        self.monthly_content_allowance = content
        self.monthly_regen_allowance = regen


class _UserSubscription:
    def __init__(self, user_id, plan_id, status="active"):
        self.user_id = user_id
        self.plan_id = plan_id
        self.status = status


@pytest.mark.asyncio
async def test_refill_skips_free_plan(monkeypatch):
    """Free plan should be skipped entirely."""
    user_id = uuid4()
    plan_id = uuid4()

    subs = [_UserSubscription(user_id, plan_id, "active")]
    free_plan = _Plan("free", 1, 0, plan_id)

    called_award = []

    # Mock result from db.execute (await returns this result)
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = subs

    # db.execute is async and returns mock_result
    async def fake_execute(q):
        return mock_result

    # Mock db.get to return plan
    async def fake_get(model, plan_id_):
        return free_plan

    async def fake_award(db, uid, pid):
        called_award.append((uid, pid))

    mock_db = AsyncMock()
    mock_db.execute = fake_execute
    mock_db.get = fake_get
    mock_db.commit = AsyncMock()

    mock_session_local = AsyncMock()
    mock_session_local.__aenter__ = AsyncMock(return_value=mock_db)
    mock_session_local.__aexit__ = AsyncMock(return_value=None)
    monkeypatch.setattr("services.refill_job.AsyncSessionLocal", lambda: mock_session_local)
    monkeypatch.setattr("services.refill_job.init_engine", MagicMock())
    monkeypatch.setattr("services.credits.award_monthly_allowance_for_user", fake_award)

    await award_for_all_subscriptions()

    # free plan should be skipped, so award should never be called
    assert len(called_award) == 0


@pytest.mark.asyncio
async def test_refill_skips_zero_allowances(monkeypatch):
    """Plan with zero allowances should be skipped."""
    user_id = uuid4()
    plan_id = uuid4()

    subs = [_UserSubscription(user_id, plan_id, "active")]
    zero_plan = _Plan("premium_30", 0, 0, plan_id)

    called_award = []

    # Mock result from db.execute
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = subs

    async def fake_execute(q):
        return mock_result

    async def fake_get(model, plan_id_):
        return zero_plan

    async def fake_award(db, uid, pid):
        called_award.append((uid, pid))

    mock_db = AsyncMock()
    mock_db.execute = fake_execute
    mock_db.get = fake_get
    mock_db.commit = AsyncMock()

    mock_session_local = AsyncMock()
    mock_session_local.__aenter__ = AsyncMock(return_value=mock_db)
    mock_session_local.__aexit__ = AsyncMock(return_value=None)
    monkeypatch.setattr("services.refill_job.AsyncSessionLocal", lambda: mock_session_local)
    monkeypatch.setattr("services.refill_job.init_engine", MagicMock())
    monkeypatch.setattr("services.credits.award_monthly_allowance_for_user", fake_award)

    await award_for_all_subscriptions()

    # zero allowance plan should be skipped
    assert len(called_award) == 0


@pytest.mark.asyncio
async def test_refill_awards_paid_plans(monkeypatch):
    """Paid plans with allowances should be awarded."""
    user_id = uuid4()
    plan_id = uuid4()

    subs = [_UserSubscription(user_id, plan_id, "active")]
    paid_plan = _Plan("standard_15", 150, 0, plan_id)

    called_award = []

    # Mock result from db.execute
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = subs

    async def fake_execute(q):
        return mock_result

    async def fake_get(model, plan_id_):
        return paid_plan

    async def fake_award(db, uid, pid):
        called_award.append((uid, pid))

    mock_db = AsyncMock()
    mock_db.execute = fake_execute
    mock_db.get = fake_get
    mock_db.commit = AsyncMock()

    mock_session_local = AsyncMock()
    mock_session_local.__aenter__ = AsyncMock(return_value=mock_db)
    mock_session_local.__aexit__ = AsyncMock(return_value=None)
    monkeypatch.setattr("services.refill_job.AsyncSessionLocal", lambda: mock_session_local)
    monkeypatch.setattr("services.refill_job.init_engine", MagicMock())
    monkeypatch.setattr("services.credits.award_monthly_allowance_for_user", fake_award)

    await award_for_all_subscriptions()

    # paid plan should be awarded
    assert len(called_award) == 1
    assert called_award[0] == (user_id, plan_id)
