"""Provider-neutral, low-cardinality automation metrics."""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Protocol

log = logging.getLogger("engagement.automation.metrics")

ALLOWED_LABELS = {
    "automation_type", "journey", "action_type", "attempt_type", "outcome",
    "failure_category", "cleanup_type",
}
COUNTERS = {
    "engagement_automation_runs_total", "engagement_candidates_evaluated_total",
    "engagement_actions_scheduled_total", "engagement_actions_delivered_total",
    "engagement_actions_suppressed_total", "engagement_actions_cancelled_total",
    "engagement_actions_retried_total", "engagement_actions_failed_total",
    "engagement_cleanup_records_total", "engagement_worker_claim_conflicts_total",
    "engagement_worker_timeouts_total",
}
TIMINGS = {
    "engagement_automation_task_duration_seconds", "engagement_queue_delay_seconds",
    "engagement_candidate_age_seconds", "engagement_database_batch_duration_seconds",
    "engagement_phase1_evaluation_duration_seconds", "engagement_cleanup_duration_seconds",
}


@dataclass(frozen=True)
class MetricEvent:
    kind: str
    name: str
    value: float
    labels: dict[str, str]


class MetricsAdapter(Protocol):
    def emit(self, event: MetricEvent) -> None: ...


class StructuredLogMetrics:
    def emit(self, event: MetricEvent) -> None:
        log.info("automation_metric kind=%s name=%s value=%s labels=%s",
                 event.kind, event.name, event.value, event.labels)


class RecordingMetrics:
    def __init__(self) -> None:
        self.events: list[MetricEvent] = []
    def emit(self, event: MetricEvent) -> None:
        self.events.append(event)


_adapter: MetricsAdapter = StructuredLogMetrics()


def set_metrics_adapter(adapter: MetricsAdapter) -> MetricsAdapter:
    global _adapter
    previous, _adapter = _adapter, adapter
    return previous


def _emit(kind: str, name: str, value: float, labels: dict[str, str]) -> None:
    forbidden = set(labels) - ALLOWED_LABELS
    if forbidden:
        raise ValueError(f"forbidden metric labels: {sorted(forbidden)}")
    _adapter.emit(MetricEvent(kind, name, float(value), dict(labels)))


def increment(metric: str, value: int = 1, **labels: str) -> None:
    if metric not in COUNTERS:
        raise ValueError(f"unknown automation counter: {metric}")
    _emit("counter", metric, value, labels)


def observe(metric: str, value: float, **labels: str) -> None:
    if metric not in TIMINGS:
        raise ValueError(f"unknown automation timing: {metric}")
    _emit("timing", metric, value, labels)
