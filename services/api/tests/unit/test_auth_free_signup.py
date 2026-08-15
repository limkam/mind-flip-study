from types import SimpleNamespace
from unittest.mock import AsyncMock
from datetime import date
import types
import sys

import pytest

import routers.auth as auth
from schemas.auth import RegisterRequest


@pytest.mark.asyncio
async def test_free_signup_requires_no_payment(monkeypatch):
    db = AsyncMock()
    add_called = {"v": False}
    db.add = lambda *_args, **_kwargs: add_called.__setitem__("v", True)
    db.commit = AsyncMock()
    db.refresh = AsyncMock()

    body = RegisterRequest(
        email='free.user@example.com',
        password='password123',
        full_name='Free User',
        date_of_birth=date(2000, 1, 1),
    )

    captured = {}

    def fake_model_validate(user):
        captured['user'] = user
        return user

    monkeypatch.setattr(auth.UserPublic, 'model_validate', staticmethod(fake_model_validate))
    fake_task = types.SimpleNamespace(delay=lambda *_a, **_k: None)
    monkeypatch.setitem(sys.modules, 'tasks.email_tasks', types.SimpleNamespace(send_welcome_email_task=fake_task))

    out = await auth.register(body=body, db=db)
    assert out.subscription_tier == 'free'
    assert out.stripe_customer_id is None
    assert add_called["v"] is True
    db.commit.assert_called_once()
