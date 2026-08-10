"""Batch 3 PostgreSQL retention and bounded-cleanup evidence."""

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from config import settings
from models.automation import EngagementAutomationSchedule
from models.email import EmailContact, EmailJob, EmailProviderEvent, EmailSuppression
from models.engagement import NudgeState
from services.engagement_automation import RETENTION_POLICY, cleanup_expired, cleanup_remaining_count
from tests.integration.test_engagement_automation_db import user_with_schedules

def test_retention_policy_is_explicit_and_protects_active_compliance_records(engine):
    assert set(RETENTION_POLICY) == {"nudge_states", "email_jobs", "email_delivery_logs",
        "provider_events", "automation_runs", "automation_schedules",
        "pending_processing_retryable_jobs", "email_suppressions", "email_contacts"}
    assert not RETENTION_POLICY["automation_schedules"][1]
    assert not RETENTION_POLICY["email_suppressions"][1]
    assert not RETENTION_POLICY["email_contacts"][1]


def test_cleanup_boundaries_dry_run_and_protected_rows(engine, monkeypatch):
    monkeypatch.setattr(settings, "ENGAGEMENT_STATE_RETENTION_DAYS", 30)
    monkeypatch.setattr(settings, "PROVIDER_EVENT_RETENTION_DAYS", 30)
    now, user_id = datetime.now(UTC), user_with_schedules(engine)
    boundary = now - timedelta(days=30)
    with Session(engine) as db:
        db.execute(text("DELETE FROM email_provider_events WHERE provider_event_id LIKE 'boundary-%'"))
        for offset, name in ((-1, "after"), (0, "exact"), (1, "before")):
            db.add(NudgeState(user_id=user_id, nudge_key=f"boundary-{name}",
                placement="dashboard", first_eligible_at=boundary,
                expires_at=boundary + timedelta(seconds=offset), context={}))
            db.add(EmailProviderEvent(provider_event_id=f"boundary-{name}",
                event_type="email.delivered", safe_metadata={}))
        db.add(EmailSuppression(user_id=user_id, scope="global", reason="complaint"))
        db.add(EmailContact(user_id=user_id, public_id=uuid.uuid4(),
                            lifecycle_consent_at=now))
        key = f"protected:{uuid.uuid4()}"
        db.add(EmailJob(user_id=user_id, template_key="welcome", category="welcome",
            classification="transactional_lifecycle", status="pending", priority=0,
            scheduled_for=boundary, next_attempt_at=boundary, retry_count=0,
            max_retries=2, idempotency_key=key, deduplication_key=key,
            payload={}, correlation_id=uuid.uuid4()))
        db.flush()
        for name in ("after", "exact", "before"):
            db.execute(text("UPDATE email_provider_events SET created_at=:at WHERE provider_event_id=:id"),
                {"at": boundary + timedelta(seconds={"after": -1, "exact": 0, "before": 1}[name]),
                 "id": f"boundary-{name}"})
        db.commit()
    with Session(engine) as db:
        first = cleanup_expired(db, now=now, limit=20, dry_run=True)
        second = cleanup_expired(db, now=now, limit=20, dry_run=True)
        db.commit()
        assert first == second
        assert first["nudge_states"] == 1 and first["provider_events"] == 1
    with Session(engine) as db:
        cleanup_expired(db, now=now, limit=20, dry_run=False)
        db.commit()
        assert db.scalar(select(func.count()).select_from(NudgeState).where(
            NudgeState.user_id == user_id)) == 2
        assert db.get(EmailProviderEvent, "boundary-after") is None
        assert db.get(EmailProviderEvent, "boundary-exact") is not None
        assert db.scalar(select(func.count()).select_from(EngagementAutomationSchedule).where(
            EngagementAutomationSchedule.user_id == user_id)) == 3
        assert db.scalar(select(func.count()).select_from(EmailSuppression).where(
            EmailSuppression.user_id == user_id)) == 1
        assert db.get(EmailContact, user_id) is not None
        assert db.scalar(select(func.count()).select_from(EmailJob).where(
            EmailJob.user_id == user_id, EmailJob.status == "pending")) == 1


def test_cleanup_is_globally_bounded_and_remaining_is_exact(engine, monkeypatch):
    monkeypatch.setattr(settings, "ENGAGEMENT_STATE_RETENTION_DAYS", 1)
    now, user_id = datetime.now(UTC), user_with_schedules(engine)
    old = now - timedelta(days=2)
    with Session(engine) as db:
        db.execute(text("DELETE FROM email_provider_events"))
        for index in range(7):
            db.add(NudgeState(user_id=user_id, nudge_key=f"bounded-{index}",
                placement="dashboard", first_eligible_at=old, expires_at=old, context={}))
        db.commit()
    with Session(engine) as db:
        result = cleanup_expired(db, now=now, limit=4, dry_run=False)
        db.commit()
        assert sum(result.values()) == 4
        assert cleanup_remaining_count(db, now=now) == 3
    with Session(engine) as db:
        assert sum(cleanup_expired(db, now=now, limit=4, dry_run=False).values()) == 3
        db.commit()
        assert cleanup_remaining_count(db, now=now) == 0
