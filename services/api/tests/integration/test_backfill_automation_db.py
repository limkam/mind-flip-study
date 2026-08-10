"""Batch 3 PostgreSQL schedule-backfill evidence."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from config import settings
from models.automation import EngagementAutomationSchedule
from models.enums import UserRole
from models.user import User
from tasks.automation_tasks import backfill_automation_schedules
def add_users(engine, count, *, banned=False):
    ids = []
    with Session(engine) as db:
        for _ in range(count):
            user_id = uuid.uuid4()
            ids.append(user_id)
            db.add(User(id=user_id, email=f"automation-{user_id}@example.test",
                hashed_password=None, role=UserRole.student, full_name="Backfill",
                preferences={}, is_banned=banned, last_active_at=datetime.now(UTC)))
        db.commit()
    return sorted(ids)


def test_backfill_dry_run_reports_without_writes(engine, monkeypatch):
    add_users(engine, 3)
    monkeypatch.setattr(settings, "AUTOMATION_BATCH_SIZE", 2)
    result = backfill_automation_schedules(dry_run=True)
    assert result["evaluated"] == 2 and result["created"] == 6
    assert result["remaining_due"] == 1 and result["next_cursor"]
    with Session(engine) as db:
        assert db.scalar(select(func.count()).select_from(EngagementAutomationSchedule)) == 0


def test_backfill_resume_partial_existing_and_banned_policy(engine, monkeypatch):
    ids = add_users(engine, 5)
    banned = add_users(engine, 1, banned=True)[0]
    monkeypatch.setattr(settings, "AUTOMATION_BATCH_SIZE", 2)
    first = backfill_automation_schedules(dry_run=False)
    second = backfill_automation_schedules(first["next_cursor"], dry_run=False)
    third = backfill_automation_schedules(second["next_cursor"], dry_run=False)
    with Session(engine) as db:
        assert db.scalar(select(func.count()).select_from(EngagementAutomationSchedule).where(
            EngagementAutomationSchedule.user_id.in_(ids))) == 15
        assert db.scalar(select(func.count()).select_from(EngagementAutomationSchedule).where(
            EngagementAutomationSchedule.user_id == banned)) == 0
        before = {row.id: row.next_evaluation_at for row in db.scalars(select(
            EngagementAutomationSchedule)).all()}
    duplicate = backfill_automation_schedules(first["next_cursor"], dry_run=False)
    assert duplicate["outcome"] == "no_due_work"
    with Session(engine) as db:
        after = {row.id: row.next_evaluation_at for row in db.scalars(select(
            EngagementAutomationSchedule)).all()}
        assert before == after
    assert third["remaining_due"] == 0


def test_partial_existing_schedules_only_fill_missing(engine):
    user_id = add_users(engine, 1)[0]
    fixed = datetime(2030, 1, 1, tzinfo=UTC)
    with Session(engine) as db:
        db.add(EngagementAutomationSchedule(user_id=user_id,
            automation_type="weekly_summary", status="active",
            next_evaluation_at=fixed, context={}))
        db.commit()
    result = backfill_automation_schedules(dry_run=False)
    assert result["created"] == 2
    with Session(engine) as db:
        rows = db.scalars(select(EngagementAutomationSchedule).where(
            EngagementAutomationSchedule.user_id == user_id)).all()
        assert len(rows) == 3
        assert next(row for row in rows if row.automation_type == "weekly_summary").next_evaluation_at == fixed
