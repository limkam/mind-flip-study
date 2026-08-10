"""Real PostgreSQL evidence for durable lifecycle job claiming."""

import os
import threading
import uuid
from datetime import UTC, datetime

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from models.email import EmailJob
from models.enums import UserRole
from models.user import User
from services.lifecycle_email import claim_due_jobs


def test_two_workers_claim_a_job_once():
    url = os.getenv("EMAIL_TEST_DATABASE_URL")
    if not url:
        pytest.skip(
            "EMAIL_TEST_DATABASE_URL is required for PostgreSQL concurrency evidence"
        )
    engine = create_engine(url)
    user_id, job_id, now = uuid.uuid4(), uuid.uuid4(), datetime.now(UTC)
    with Session(engine) as db:
        db.execute(text("DELETE FROM email_provider_events"))
        db.execute(text("DELETE FROM users WHERE email LIKE 'email-%@example.test'"))
        db.commit()
        db.add(
            User(
                id=user_id,
                email=f"email-{user_id}@example.test",
                hashed_password=None,
                role=UserRole.student,
                full_name="Concurrency Test",
                preferences={},
            )
        )
        db.flush()
        db.add(
            EmailJob(
                id=job_id,
                user_id=user_id,
                template_key="welcome",
                template_version="v1",
                category="welcome",
                classification="transactional_lifecycle",
                status="pending",
                priority=1,
                scheduled_for=now,
                next_attempt_at=now,
                retry_count=0,
                max_retries=2,
                idempotency_key=f"claim:{job_id}",
                deduplication_key=f"claim:{job_id}",
                payload={"recipient_verified": True},
                correlation_id=uuid.uuid4(),
            )
        )
        db.commit()

    barrier = threading.Barrier(2)
    claimed: list[uuid.UUID] = []

    def worker() -> None:
        with Session(engine) as db:
            barrier.wait()
            rows = claim_due_jobs(db, now=now, limit=1)
            claimed.extend(row.id for row in rows)
            db.commit()

    threads = [threading.Thread(target=worker), threading.Thread(target=worker)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert claimed == [job_id]
    with Session(engine) as db:
        db.delete(db.get(User, user_id))
        db.commit()
