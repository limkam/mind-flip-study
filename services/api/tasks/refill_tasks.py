"""Celery tasks for monthly subscription allowance refills."""

from tasks.celery_app import celery
from services.refill_job import award_for_all_subscriptions


@celery.task(name="tasks.refill_tasks.award_monthly_allowances")
def award_monthly_allowances_task():
    """Award monthly allowances to all active subscriptions.
    
    Scheduled to run monthly on the 1st at 00:00 UTC.
    """
    import asyncio
    asyncio.run(award_for_all_subscriptions())
