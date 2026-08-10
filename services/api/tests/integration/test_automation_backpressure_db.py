"""Batch 3 PostgreSQL backpressure evidence for schedule scans."""

from datetime import UTC, datetime

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from config import settings
from models.automation import EngagementAutomationRun, EngagementAutomationSchedule
from tasks.automation_tasks import run_candidate_scan
from tests.integration.test_engagement_automation_db import user_with_schedules

@pytest.mark.parametrize(("automation_type", "interval"), [
    ("weekly_summary", lambda: settings.WEEKLY_SUMMARY_SCAN_INTERVAL_MINUTES * 60),
    ("inactivity", lambda: settings.INACTIVITY_SCAN_INTERVAL_MINUTES * 60),
    ("streak_risk", lambda: settings.STREAK_RISK_SCAN_INTERVAL_MINUTES * 60),
])
def test_schedule_scan_stops_at_batch_limit_and_persists_remaining(
        engine, monkeypatch, automation_type, interval):
    for _ in range(5):
        user_with_schedules(engine)
    monkeypatch.setattr(settings, "AUTOMATION_BATCH_SIZE", 2)
    monkeypatch.setattr(settings, "AUTOMATION_MAX_BATCHES_PER_RUN", 2)
    monkeypatch.setattr(settings, "ENGAGEMENT_AUTOMATION_ENABLED", True)
    result = run_candidate_scan(automation_type, interval())
    assert result["claimed"] == 4
    assert result["remaining_due"] == 1
    assert result["outcome"] == "partially_processed"
    with Session(engine) as db:
        run = db.scalar(select(EngagementAutomationRun).where(
            EngagementAutomationRun.automation_type == automation_type))
        assert run.status == "partially_completed"
        assert run.claimed_count == 4 and run.remaining_due_count == 1
        assert db.scalar(select(EngagementAutomationSchedule).where(
            EngagementAutomationSchedule.automation_type == automation_type,
            EngagementAutomationSchedule.next_evaluation_at <= datetime.now(UTC))) is not None
