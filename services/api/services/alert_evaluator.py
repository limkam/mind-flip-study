"""Module 8 alert threshold evaluator — run periodically by Celery beat.

Wires in each threshold as its source metric shipped in Modules 1/3/6/7: churn, extra-credit
% of MRR, AI cost p95, gross margin, chargeback rate, conversion failure rate, DMCA receipt.
Two thresholds (churn, conversion failure rate) have no business-set target anywhere in this
codebase or the build spec — they're marked `placeholder=True` and use a reasonable default;
swap in the real number whenever one is decided.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.alerts import AlertEvent
from services import owner_console_service
from services.financial_metrics_service import calculate_monthly_churn
from services.slack_alerts import send_slack_alert


@dataclass(frozen=True)
class AlertThreshold:
    key: str
    label: str
    unit: str
    threshold: float
    comparison: str  # "gt" (breach when value > threshold) or "lt" (breach when value < threshold)
    placeholder: bool = False


ALERT_THRESHOLDS: list[AlertThreshold] = [
    AlertThreshold("churn_rate_pct", "Monthly churn rate", "%", 10.0, "gt", placeholder=True),
    AlertThreshold("extra_credit_pct_of_mrr", "Extra Credit revenue % of MRR", "%", 15.0, "gt"),
    AlertThreshold("ai_cost_p95_usd", "AI cost per conversion p95 (any provider)", "$", 0.15, "gt"),
    AlertThreshold("margin_pct", "Gross margin (weakest plan)", "%", 70.0, "lt"),
    AlertThreshold("chargeback_rate_pct", "Chargeback/dispute rate", "%", 0.75, "gt"),
    AlertThreshold("conversion_failure_rate_pct", "Book conversion failure rate", "%", 10.0, "gt", placeholder=True),
    AlertThreshold("dmca_received_7d", "New DMCA notices (7d)", "count", 0, "gt"),
]


async def _current_values(db: AsyncSession) -> dict[str, float]:
    now = datetime.now(UTC)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    churn = await calculate_monthly_churn(db, period_start=month_start, now=now)
    revenue = await owner_console_service.revenue_metrics(db)
    technical = await owner_console_service.technical_metrics(db)
    unit_econ = await owner_console_service.unit_economics_metrics(db)
    compliance = await owner_console_service.compliance_metrics(db)

    ai_cost_p95 = max((p.p95_usd for p in technical.ai_cost_by_provider), default=0.0)
    margins = [p.margin_pct for p in unit_econ.plan_margins]
    weakest_margin = min(margins) if margins else 100.0  # no paying plans yet -> nothing to alert on
    conversion_total = sum(c.count for c in technical.conversion_success)
    conversion_errors = sum(c.count for c in technical.conversion_success if c.status == "error")
    conversion_failure_rate = round(conversion_errors / conversion_total * 100, 1) if conversion_total else 0.0
    dmca_7d = sum(1 for n in compliance.dmca_queue if n.received_at >= now - timedelta(days=7))

    return {
        "churn_rate_pct": churn.churn_rate_pct,
        "extra_credit_pct_of_mrr": revenue.extra_credit_pct_of_mrr,
        "ai_cost_p95_usd": ai_cost_p95,
        "margin_pct": weakest_margin,
        "chargeback_rate_pct": compliance.chargeback_rate_pct,
        "conversion_failure_rate_pct": conversion_failure_rate,
        "dmca_received_7d": float(dmca_7d),
    }


def _is_breached(value: float, threshold: AlertThreshold) -> bool:
    return value > threshold.threshold if threshold.comparison == "gt" else value < threshold.threshold


async def evaluate_alerts(db: AsyncSession, *, notify: bool = True) -> list[AlertEvent]:
    """Evaluate every threshold. Opens a new AlertEvent for a metric that just breached
    (skipped if one's already open for that metric — no repeat Slack spam while it stays
    breached), and auto-resolves any open event whose metric has recovered."""
    values = await _current_values(db)
    newly_triggered: list[AlertEvent] = []
    for threshold in ALERT_THRESHOLDS:
        value = values.get(threshold.key, 0.0)
        breached = _is_breached(value, threshold)
        open_event = await db.scalar(
            select(AlertEvent)
            .where(AlertEvent.metric_key == threshold.key, AlertEvent.resolved_at.is_(None))
            .order_by(AlertEvent.triggered_at.desc())
            .limit(1)
        )
        if breached and open_event is None:
            event = AlertEvent(
                metric_key=threshold.key,
                severity="critical" if threshold.key in ("chargeback_rate_pct", "margin_pct") else "warning",
                value=value,
                threshold=threshold.threshold,
                message=f"{threshold.label} is {value}{threshold.unit} (threshold {threshold.threshold}{threshold.unit})",
            )
            db.add(event)
            newly_triggered.append(event)
        elif not breached and open_event is not None:
            open_event.resolved_at = datetime.now(UTC)
            db.add(open_event)
    await db.commit()
    if notify:
        for event in newly_triggered:
            send_slack_alert(event.message, severity=event.severity)
    return newly_triggered
