"""Consistent structured task events without user or secret fields."""
import json
import logging

log = logging.getLogger("engagement.automation")

EVENTS = {"task_started", "batch_started", "batch_completed", "task_completed",
          "task_partially_completed", "task_retrying", "task_failed", "task_timed_out",
          "lease_recovered", "cleanup_completed", "backfill_progress"}
FIELDS = ("automation_type", "task_name", "idempotency_key", "correlation_id", "worker_id",
          "batch_number", "claimed_count", "evaluated_count", "scheduled_count",
          "suppressed_count", "cancelled_count", "retried_count", "failed_count",
          "skipped_count", "remaining_due_count", "outcome", "duration_ms", "failure_code")


def task_event(event: str, **values: object) -> dict[str, object]:
    if event not in EVENTS:
        raise ValueError("unknown automation log event")
    record = {field: values.get(field) for field in FIELDS}
    record["event"] = event
    log.info("automation_event %s", json.dumps(record, sort_keys=True, default=str))
    return record
