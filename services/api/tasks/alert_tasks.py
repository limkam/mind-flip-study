"""Celery task: periodic Owner Console alert threshold evaluation (Module 8)."""

import asyncio

from config import settings
from database import AsyncSessionLocal, init_engine
from tasks.celery_app import celery


async def _run_evaluation() -> int:
    from services.alert_evaluator import evaluate_alerts

    init_engine(settings.DATABASE_URL)
    async with AsyncSessionLocal() as db:  # type: ignore
        triggered = await evaluate_alerts(db)
        return len(triggered)


@celery.task(name="tasks.alert_tasks.evaluate_owner_console_alerts")
def evaluate_owner_console_alerts_task() -> dict[str, int]:
    """Evaluate every Owner Console alert threshold and Slack-notify newly-breached ones."""
    count = asyncio.run(_run_evaluation())
    return {"newly_triggered": count}
