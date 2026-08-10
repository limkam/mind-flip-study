"""Scheduled Stripe reconciliation."""

from services.stripe_reconciliation import reconcile_stripe
from tasks.celery_app import celery


@celery.task(name="tasks.billing_tasks.reconcile_stripe_billing")
def reconcile_stripe_billing_task() -> dict[str, int]:
    return reconcile_stripe()
