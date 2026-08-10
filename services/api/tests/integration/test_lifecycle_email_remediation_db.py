"""Production-grade PostgreSQL evidence for Phase 2 remediation."""

import os
import threading
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import create_engine, func, select, text
from sqlalchemy.orm import Session

from config import settings
from emails.provider import EmailSendResult
from emails.unsubscribe import make_token
from models.email import (
    EmailContact,
    EmailDeliveryLog,
    EmailJob,
    EmailProviderEvent,
    EmailSuppression,
)
from models.achievement import Achievement
from models.engagement import EngagementEvent, EngagementPreference
from models.enums import UserRole
from models.user import User
from routers.email_webhooks import process_provider_event
from routers.email_preferences import unsubscribe
from services.email_coordination import coordination_lock_key
from services.lifecycle_email import cancel_pending_jobs, schedule_job
from tasks.email_tasks import (
    process_lifecycle_email_jobs_with_provider,
    schedule_achievement_email_task,
    schedule_engagement_email_task,
)
from tests.fake_email_provider import RecordingEmailProvider


@pytest.fixture
def engine(monkeypatch):
    url = os.getenv("EMAIL_TEST_DATABASE_URL")
    if not url:
        pytest.skip("EMAIL_TEST_DATABASE_URL is required")
    monkeypatch.setattr(settings, "DATABASE_URL", url)
    monkeypatch.setattr(settings, "EMAIL_DELIVERY_MODE", "log_only")
    monkeypatch.setattr(settings, "ENGAGEMENT_LIFECYCLE_EMAILS_ENABLED", True)
    monkeypatch.setattr(settings, "EMAIL_GLOBAL_ENABLED", True)
    import database_sync

    database_sync._engine = None
    database_sync.SessionLocal = None
    test_engine = create_engine(url)
    with Session(test_engine) as db:
        db.execute(text("DELETE FROM email_provider_events"))
        db.execute(
            text(
                "DELETE FROM users WHERE email LIKE 'phase2-%@example.test' OR email LIKE 'email-%@example.test'"
            )
        )
        db.commit()
    yield test_engine
    with Session(test_engine) as db:
        db.execute(text("DELETE FROM email_provider_events"))
        db.execute(
            text(
                "DELETE FROM users WHERE email LIKE 'phase2-%@example.test' OR email LIKE 'email-%@example.test'"
            )
        )
        db.commit()


def make_user(engine, *, consent=True):
    user_id = uuid.uuid4()
    with Session(engine) as db:
        db.add(
            User(
                id=user_id,
                email=f"phase2-{user_id}@example.test",
                hashed_password=None,
                role=UserRole.student,
                full_name="Phase Two",
                preferences={},
            )
        )
        db.flush()
        db.add(EngagementPreference(user_id=user_id, timezone="UTC"))
        db.add(
            EmailContact(
                user_id=user_id,
                public_id=uuid.uuid4(),
                lifecycle_consent_at=datetime.now(UTC) if consent else None,
            )
        )
        db.commit()
    return user_id


def add_job(
    engine,
    user_id,
    *,
    key=None,
    category="welcome",
    classification="transactional_lifecycle",
    entity_type=None,
    entity_id=None,
    status="pending",
    due=None,
    provider_message_id=None,
    max_retries=2,
):
    key = key or str(uuid.uuid4())
    due = due or datetime.now(UTC) - timedelta(seconds=1)
    with Session(engine) as db:
        job = EmailJob(
            user_id=user_id,
            template_key="continue_learning" if entity_id else "welcome",
            template_version="v1",
            category=category,
            classification=classification,
            status=status,
            priority=1,
            scheduled_for=due,
            next_attempt_at=due,
            retry_count=0,
            max_retries=max_retries,
            idempotency_key=key,
            deduplication_key=key,
            entity_type=entity_type,
            entity_id=entity_id,
            provider_message_id=provider_message_id,
            payload={
                "recipient_verified": True,
                "first_name": "Phase",
                "entity_name": "Biology",
                "cta_url": "https://example.test/study",
                "preferences_url": "https://example.test/settings",
                "unsubscribe_url": "https://example.test/unsub",
            },
            correlation_id=uuid.uuid4(),
        )
        db.add(job)
        db.commit()
        return job.id


@pytest.mark.parametrize("journey", ["welcome", "achievement", "weekly"])
def test_concurrent_journey_scheduling_deduplicates(engine, journey):
    user_id, barrier, created = make_user(engine), threading.Barrier(2), []
    key = f"{journey}:{user_id}:period-or-event"

    def run():
        with Session(engine) as db:
            barrier.wait()
            job = schedule_job(
                db,
                user_id=user_id,
                template_key="welcome",
                category="welcome",
                classification="transactional_lifecycle",
                idempotency_key=key,
                deduplication_key=key,
                scheduled_for=datetime.now(UTC),
                payload={
                    "recipient_verified": True,
                    "first_name": "Phase",
                    "cta_url": "https://example.test/app",
                    "preferences_url": "https://example.test/settings",
                },
            )
            db.commit()
            created.append(job.id)

    threads = [threading.Thread(target=run), threading.Thread(target=run)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    with Session(engine) as db:
        assert (
            db.scalar(
                select(func.count())
                .select_from(EmailJob)
                .where(EmailJob.deduplication_key == key)
            )
            == 1
        )
    assert len(created) == 2 and created[0] == created[1]


def test_two_workers_make_one_provider_call(engine):
    user_id = make_user(engine)
    job_id = add_job(engine, user_id)
    provider, barrier = RecordingEmailProvider(), threading.Barrier(2)

    def run():
        barrier.wait()
        process_lifecycle_email_jobs_with_provider(lambda _email: provider)

    threads = [threading.Thread(target=run), threading.Thread(target=run)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    assert [a.job_id for a in provider.attempts] == [str(job_id)]


@pytest.mark.parametrize(
    "category,retryable",
    [
        ("network_error", True),
        ("provider_timeout", True),
        ("rate_limited", True),
        ("temporary_provider_failure", True),
        ("invalid_recipient", False),
        ("authentication_error", False),
        ("configuration_error", False),
        ("permanent_provider_rejection", False),
    ],
)
def test_provider_failure_persists_retry_or_dead_letter(engine, category, retryable):
    user_id = make_user(engine)
    job_id = add_job(engine, user_id)
    result = EmailSendResult(
        "recording",
        None,
        False,
        category,
        category,
        retryable,
        retry_after_seconds=90 if category == "rate_limited" else None,
    )
    process_lifecycle_email_jobs_with_provider(
        lambda _email: RecordingEmailProvider([result])
    )
    with Session(engine) as db:
        job = db.get(EmailJob, job_id)
        assert job.status == ("pending" if retryable else "dead_letter")
        assert job.retry_count == (1 if retryable else 0)
        if retryable:
            assert job.next_attempt_at > datetime.now(UTC)


@pytest.mark.parametrize("reason", ["hard_bounce", "complaint", "unsubscribe"])
def test_suppression_prevents_provider_call(engine, reason):
    user_id = make_user(engine)
    add_job(engine, user_id, category="learning", classification="lifecycle")
    with Session(engine) as db:
        db.add(EmailSuppression(user_id=user_id, scope="global", reason=reason))
        db.commit()
    provider = RecordingEmailProvider()
    process_lifecycle_email_jobs_with_provider(lambda _email: provider)
    assert provider.attempts == []


def test_missing_consent_prevents_provider_call(engine):
    user_id = make_user(engine, consent=False)
    add_job(engine, user_id, category="learning", classification="lifecycle")
    provider = RecordingEmailProvider()
    process_lifecycle_email_jobs_with_provider(lambda _email: provider)
    assert provider.attempts == []


def test_concurrent_cancellation_is_idempotent(engine):
    user_id, entity_id = make_user(engine), str(uuid.uuid4())
    job_id = add_job(
        engine,
        user_id,
        category="learning",
        classification="lifecycle",
        entity_type="lesson",
        entity_id=entity_id,
    )
    barrier, counts = threading.Barrier(2), []

    def run():
        with Session(engine) as db:
            barrier.wait()
            counts.append(
                cancel_pending_jobs(
                    db,
                    user_id=user_id,
                    template_key="continue_learning",
                    entity_type="lesson",
                    entity_id=entity_id,
                )
            )
            db.commit()

    threads = [threading.Thread(target=run), threading.Thread(target=run)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    with Session(engine) as db:
        assert db.get(EmailJob, job_id).status == "cancelled"
        assert (
            db.scalar(
                select(func.count())
                .select_from(EmailDeliveryLog)
                .where(
                    EmailDeliveryLog.email_job_id == job_id,
                    EmailDeliveryLog.event_type == "cancelled",
                )
            )
            == 1
        )
    assert sorted(counts) == [0, 1]


def test_concurrent_webhook_is_processed_once(engine):
    user_id = make_user(engine)
    job_id = add_job(
        engine, user_id, status="sent", provider_message_id="provider-concurrent"
    )
    barrier, results = threading.Barrier(2), []

    def run():
        barrier.wait()
        results.append(
            process_provider_event(
                "evt-concurrent", "email.complained", "provider-concurrent", {}
            )
        )

    threads = [threading.Thread(target=run), threading.Thread(target=run)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    with Session(engine) as db:
        assert (
            db.scalar(
                select(func.count())
                .select_from(EmailProviderEvent)
                .where(EmailProviderEvent.provider_event_id == "evt-concurrent")
            )
            == 1
        )
        assert (
            db.scalar(
                select(func.count())
                .select_from(EmailSuppression)
                .where(
                    EmailSuppression.user_id == user_id,
                    EmailSuppression.reason == "complaint",
                )
            )
            == 1
        )
        assert (
            db.scalar(
                select(func.count())
                .select_from(EmailDeliveryLog)
                .where(
                    EmailDeliveryLog.email_job_id == job_id,
                    EmailDeliveryLog.event_type == "complained",
                )
            )
            == 1
        )
    assert sorted(results) == [False, True]


@pytest.mark.parametrize(
    "event_type,data,blocked",
    [
        ("email.bounced", {"bounce_type": "hard"}, True),
        ("email.complained", {}, True),
        ("email.bounced", {"bounce_type": "temporary"}, False),
    ],
)
def test_webhook_suppression_affects_later_queued_job(
    engine, event_type, data, blocked
):
    user_id = make_user(engine)
    add_job(
        engine, user_id, status="sent", provider_message_id=f"source-{uuid.uuid4()}"
    )
    queued = add_job(engine, user_id, category="learning", classification="lifecycle")
    with Session(engine) as db:
        source = db.scalar(
            select(EmailJob).where(
                EmailJob.user_id == user_id, EmailJob.status == "sent"
            )
        )
    assert process_provider_event(
        f"evt-{uuid.uuid4()}", event_type, source.provider_message_id, data
    )
    provider = RecordingEmailProvider()
    process_lifecycle_email_jobs_with_provider(lambda _email: provider)
    assert (provider.attempts == []) is blocked
    with Session(engine) as db:
        assert db.get(EmailJob, queued).status == ("suppressed" if blocked else "sent")


def test_unknown_and_replayed_webhook_are_safe(engine):
    event_id = f"evt-unknown-{uuid.uuid4()}"
    assert (
        process_provider_event(event_id, "email.delivered", "unknown-message", {})
        is True
    )
    assert (
        process_provider_event(event_id, "email.delivered", "unknown-message", {})
        is False
    )


def test_achievement_without_phase1_email_authority_creates_no_job(engine):
    user_id, event_id, achievement_id = make_user(engine), uuid.uuid4(), uuid.uuid4()
    with Session(engine) as db:
        db.add(
            Achievement(
                id=achievement_id,
                user_id=user_id,
                achievement_type="unauthorized",
                metadata_={},
            )
        )
        db.add(
            EngagementEvent(
                id=event_id,
                user_id=user_id,
                event_type="achievement.unlocked",
                source="test",
                entity_type="achievement",
                entity_id=str(uuid.uuid4()),
                metadata_={"engagement_decisions": ["analytics"]},
                idempotency_key=f"unauthorized:{event_id}",
                occurred_at=datetime.now(UTC),
            )
        )
        db.commit()
    assert schedule_engagement_email_task(str(event_id)) is False
    assert schedule_achievement_email_task(str(event_id), str(achievement_id)) is False
    with Session(engine) as db:
        assert (
            db.scalar(
                select(func.count())
                .select_from(EmailJob)
                .where(EmailJob.engagement_event_id == event_id)
            )
            == 0
        )


def test_retry_reaches_dead_letter_exactly_once(engine, monkeypatch):
    monkeypatch.setattr(settings, "EMAIL_RETRY_BASE_SECONDS", 1)
    user_id = make_user(engine)
    job_id = add_job(engine, user_id, max_retries=1)
    failure = EmailSendResult("recording", None, False, "network_error", "down", True)
    process_lifecycle_email_jobs_with_provider(
        lambda _email: RecordingEmailProvider([failure])
    )
    with Session(engine) as db:
        job = db.get(EmailJob, job_id)
        job.next_attempt_at = datetime.now(UTC) - timedelta(seconds=1)
        db.commit()
    process_lifecycle_email_jobs_with_provider(
        lambda _email: RecordingEmailProvider([failure])
    )
    process_lifecycle_email_jobs_with_provider(
        lambda _email: RecordingEmailProvider([failure])
    )
    with Session(engine) as db:
        job = db.get(EmailJob, job_id)
        assert job.status == "dead_letter" and job.retry_count == 1
        assert (
            db.scalar(
                select(func.count())
                .select_from(EmailDeliveryLog)
                .where(
                    EmailDeliveryLog.email_job_id == job_id,
                    EmailDeliveryLog.event_type == "dead_lettered",
                )
            )
            == 1
        )


def test_processing_timeout_recovers_only_stale_unsent(engine, monkeypatch):
    monkeypatch.setattr(settings, "EMAIL_PROCESSING_TIMEOUT_MINUTES", 5)
    user_id = make_user(engine)
    stale = add_job(engine, user_id, status="processing")
    fresh = add_job(engine, user_id, status="processing")
    sent = add_job(engine, user_id, status="sent", provider_message_id="already-sent")
    with Session(engine) as db:
        db.get(EmailJob, stale).processing_started_at = datetime.now(UTC) - timedelta(
            minutes=10
        )
        db.get(EmailJob, fresh).processing_started_at = datetime.now(UTC)
        db.commit()
    process_lifecycle_email_jobs_with_provider(lambda _email: RecordingEmailProvider())
    with Session(engine) as db:
        assert db.get(EmailJob, stale).status == "sent"
        assert db.get(EmailJob, fresh).status == "processing"
        assert db.get(EmailJob, sent).status == "sent"


def test_completion_wins_before_authorisation_zero_provider_calls(engine):
    user_id, entity_id = make_user(engine), str(uuid.uuid4())
    job_id = add_job(
        engine,
        user_id,
        category="learning",
        classification="lifecycle",
        entity_type="lesson",
        entity_id=entity_id,
    )
    lock_key = coordination_lock_key(user_id, "lesson", entity_id)
    provider, finished = RecordingEmailProvider(), threading.Event()
    with Session(engine) as completion:
        completion.execute(
            text("SELECT pg_advisory_xact_lock(:key)"), {"key": lock_key}
        )
        completion.add(
            EngagementEvent(
                user_id=user_id,
                event_type="lesson.completed",
                source="test",
                entity_type="lesson",
                entity_id=entity_id,
                metadata_={},
                idempotency_key=f"complete:{job_id}",
                occurred_at=datetime.now(UTC),
            )
        )
        thread = threading.Thread(
            target=lambda: (
                process_lifecycle_email_jobs_with_provider(lambda _email: provider),
                finished.set(),
            )
        )
        thread.start()
        for _ in range(100):
            with Session(engine) as check:
                if check.get(EmailJob, job_id).status == "processing":
                    break
            threading.Event().wait(0.01)
        completion.commit()
    thread.join(timeout=5)
    assert finished.is_set() and provider.attempts == []
    with Session(engine) as db:
        assert db.get(EmailJob, job_id).status == "cancelled"


def test_authorisation_wins_before_completion_one_provider_call(engine):
    user_id, entity_id = make_user(engine), str(uuid.uuid4())
    job_id = add_job(
        engine,
        user_id,
        category="learning",
        classification="lifecycle",
        entity_type="lesson",
        entity_id=entity_id,
    )
    provider, auth_entered, release_auth = (
        RecordingEmailProvider(),
        threading.Event(),
        threading.Event(),
    )

    def factory(_email):
        auth_entered.set()
        assert release_auth.wait(5)
        return provider

    worker = threading.Thread(
        target=lambda: process_lifecycle_email_jobs_with_provider(factory)
    )
    worker.start()
    assert auth_entered.wait(5)
    completion_done = threading.Event()

    def complete():
        with Session(engine) as db:
            db.execute(
                text("SELECT pg_advisory_xact_lock(:key)"),
                {"key": coordination_lock_key(user_id, "lesson", entity_id)},
            )
            db.add(
                EngagementEvent(
                    user_id=user_id,
                    event_type="lesson.completed",
                    source="test",
                    entity_type="lesson",
                    entity_id=entity_id,
                    metadata_={},
                    idempotency_key=f"complete:{job_id}",
                    occurred_at=datetime.now(UTC),
                )
            )
            db.commit()
        completion_done.set()

    completion = threading.Thread(target=complete)
    completion.start()
    release_auth.set()
    worker.join(timeout=5)
    completion.join(timeout=5)
    assert completion_done.is_set() and len(provider.attempts) == 1
    with Session(engine) as db:
        assert db.get(EmailJob, job_id).status == "sent"


def test_signed_unsubscribe_cancels_pending_jobs_idempotently(engine, monkeypatch):
    monkeypatch.setattr(
        settings, "EMAIL_UNSUBSCRIBE_SECRET", "test-secret-not-production"
    )
    user_id = make_user(engine)
    other_user_id = make_user(engine)
    job_id = add_job(engine, user_id, category="learning", classification="lifecycle")
    other_job_id = add_job(
        engine, other_user_id, category="learning", classification="lifecycle"
    )
    with Session(engine) as db:
        token = make_token(db.get(EmailContact, user_id).public_id, "learning")
    assert unsubscribe(token)["status"] == "unsubscribed"
    assert unsubscribe(token)["status"] == "unsubscribed"
    with Session(engine) as db:
        assert db.get(EmailJob, job_id).status == "cancelled"
        assert db.get(EmailJob, other_job_id).status == "pending"
        assert (
            db.scalar(
                select(func.count())
                .select_from(EmailSuppression)
                .where(
                    EmailSuppression.user_id == user_id,
                    EmailSuppression.reason == "unsubscribe",
                )
            )
            == 1
        )
