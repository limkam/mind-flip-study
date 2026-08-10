"""Shared fixtures for PostgreSQL integration evidence."""

import os

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from config import settings


@pytest.fixture
def engine(monkeypatch):
    url = os.getenv("AUTOMATION_TEST_DATABASE_URL")
    if not url:
        pytest.skip("AUTOMATION_TEST_DATABASE_URL is required")
    monkeypatch.setattr(settings, "DATABASE_URL", url)
    monkeypatch.setattr(settings, "ENGAGEMENT_AUTOMATION_ENABLED", True)
    import database_sync

    database_sync._engine = None
    database_sync.SessionLocal = None
    result = create_engine(url)
    with Session(result) as db:
        db.execute(text("DELETE FROM engagement_automation_runs"))
        db.execute(text("DELETE FROM email_provider_events"))
        # This database is explicitly disposable.  Clearing every synthetic user
        # prevents earlier Phase 1/2 suites from changing cursor/count assertions
        # when the required combined regression runs in a single pytest process.
        db.execute(text("DELETE FROM users"))
        db.commit()
    yield result
    result.dispose()
