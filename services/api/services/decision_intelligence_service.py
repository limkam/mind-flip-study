"""Explainable, server-side decisions and read-only business simulations."""

from datetime import UTC, datetime, timedelta
from io import BytesIO

from sqlalchemy.ext.asyncio import AsyncSession

from models.user import User
from repositories.owner_dashboard_repository import OwnerDashboardRepository
from schemas.decision_intelligence import DecisionPreferences, ScenarioInput
from services.owner_dashboard_service import OwnerDashboardService


def simulate_baseline(
    mrr, margin, cash, ai_cost, paying_users, scenario: ScenarioInput
):
    price_impact = scenario.price_change * paying_users
    conversion_impact = mrr * scenario.conversion_change_pct / 100
    churn_impact = mrr * scenario.churn_reduction_pct / 100
    projected_mrr = max(0, mrr + price_impact + conversion_impact + churn_impact)
    ai_savings = ai_cost * scenario.ai_cost_reduction_pct / 100
    projected_profit = (
        margin + price_impact + conversion_impact + churn_impact + ai_savings
    )
    projected_cash = cash + projected_profit
    projected_margin = projected_profit / projected_mrr * 100 if projected_mrr else 0
    return {
        "mrr": round(projected_mrr, 2),
        "profit": round(projected_profit, 2),
        "cash": round(projected_cash, 2),
        "margin_pct": round(projected_margin, 1),
        "runway_months": round(
            max(0, projected_cash) / max(1, ai_cost - ai_savings), 1
        ),
        "ltv": round(projected_profit * 12 / max(1, paying_users), 2),
    }


class DecisionIntelligenceService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = OwnerDashboardRepository(db)
        self.dashboard = OwnerDashboardService(self.repo)

    async def decision_center(self):
        now = datetime.now(UTC)
        counts = await self.repo.operational_counts(now - timedelta(days=7))
        units = await self.dashboard.unit_economics(
            page=1,
            page_size=100,
            search=None,
            status=None,
            segment=None,
            sort="contribution_margin",
            direction="asc",
        )
        ai_week = await self.repo.ai_cost(now - timedelta(days=7), now)
        ai_prior = await self.repo.ai_cost(
            now - timedelta(days=14), now - timedelta(days=7)
        )
        decisions = []

        def add(key, priority, title, why, impact, consequence, action, url):
            decisions.append(
                {
                    "id": key,
                    "priority": priority,
                    "title": title,
                    "why": why,
                    "impact": impact,
                    "if_ignored": consequence,
                    "recommended_action": action,
                    "action_url": url,
                    "confidence": "high",
                }
            )

        if counts[2]:
            add(
                "duplicates",
                "critical",
                f"{counts[2]} customers have duplicate active subscriptions",
                "Multiple active canonical subscription rows exist for the same customer.",
                "Potential duplicate billing and refund exposure.",
                "Refund liability and customer trust risk may increase.",
                "Review subscriptions and refund inappropriate duplicates.",
                "/admin/financial-analytics",
            )
        if counts[1]:
            add(
                "failed-payments",
                "high",
                f"{counts[1]} failed payments need attention",
                "Invoices remain open or uncollectible.",
                "At-risk recurring revenue.",
                "MRR and cash collection may decline.",
                "Review invoices and contact affected customers.",
                "/admin/financial-analytics",
            )
        negative = [x for x in units["items"] if "negative_margin" in x["flags"]]
        if negative:
            loss = abs(sum(x["contribution_margin"] for x in negative))
            add(
                "negative-margin",
                "high",
                f"{len(negative)} customers are unprofitable",
                "AI and variable costs exceed recognized revenue.",
                f"Current monthly contribution loss: {loss:.2f} USD.",
                "Losses compound as usage grows.",
                "Review AI usage, quota, and upgrade options.",
                "/admin/ai-usage",
            )
        ai_change = (ai_week - ai_prior) / ai_prior * 100 if ai_prior else 0
        if ai_change > 10:
            add(
                "ai-spike",
                "medium",
                f"AI spending increased {ai_change:.1f}% this week",
                "Provider telemetry exceeds the prior seven-day period.",
                f"Potential monthly increase: {(ai_week - ai_prior) * 4.3:.2f} USD.",
                "Margin compression may continue.",
                "Review expensive models and features.",
                "/admin/ai-usage",
            )
        order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
        decisions.sort(key=lambda x: order[x["priority"]])
        return {
            "items": decisions,
            "generated_at": now,
            "empty_message": "No priority decisions are indicated by canonical data.",
        }

    async def kpi_explanations(self):
        summary = await self.dashboard.summary()
        explanations = []
        for metric in summary["metrics"]:
            direction = metric["trend"]
            previous = metric["previous_value"]
            explanations.append(
                {
                    **metric,
                    "what_changed": f"{metric['label']} moved {direction} by {abs(metric['change_pct'] or 0):.1f}% versus its comparison period.",
                    "why": metric["tooltip"],
                    "biggest_contributor": "Canonical subscription revenue and AI telemetry in the selected period.",
                    "historical_comparison": f"Previous value: {previous:.2f}"
                    if previous is not None
                    else "Historical subscription snapshot unavailable.",
                    "recommended_action": "Investigate the underlying workflow."
                    if direction == "down"
                    else "Monitor the trend and preserve current drivers.",
                    "action_url": "/admin/financial-analytics"
                    if "ai" not in metric["key"]
                    else "/admin/ai-usage",
                    "confidence": 99 if not summary["freshness"]["stale"] else 70,
                }
            )
        return {"items": explanations, "freshness": summary["freshness"]}

    async def timeline(self, period: str):
        now = datetime.now(UTC)
        days = {"today": 1, "yesterday": 2, "7d": 7, "30d": 30}.get(period, 1)
        start = now.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(
            days=days - 1
        )
        analytics = await self.repo.analytics(start, now)
        events = []
        for row in analytics["revenue_daily"]:
            events.append(
                {
                    "type": "revenue",
                    "occurred_at": row.bucket,
                    "title": "Revenue collected",
                    "description": f"Net invoice cash: {float(row.net or 0) / 100:.2f} USD",
                    "severity": "info",
                }
            )
        for row in analytics["ai_daily"]:
            events.append(
                {
                    "type": "ai_spend",
                    "occurred_at": row.bucket,
                    "title": "AI activity",
                    "description": f"{int(row.requests or 0)} requests cost {float(row.cost or 0):.2f} USD",
                    "severity": "info",
                }
            )
        events.sort(key=lambda x: x["occurred_at"], reverse=True)
        return {"period": period, "items": events[:100]}

    def preferences(self, user: User):
        return DecisionPreferences.model_validate(
            (user.preferences or {}).get("owner_dashboard", {})
        )

    async def save_preferences(self, user: User, body: DecisionPreferences):
        prefs = dict(user.preferences or {})
        prefs["owner_dashboard"] = body.model_dump()
        user.preferences = prefs
        await self.db.commit()
        return body

    async def goal_progress(self, user: User):
        prefs = self.preferences(user)
        summary = await self.dashboard.summary()
        forecast = await self.dashboard.forecasts()
        metrics = {x["key"]: x for x in summary["metrics"]}
        forecast_mrr = next(
            (x["value"] for x in forecast["cards"] if x["key"] == "mrr"),
            metrics.get("mrr", {}).get("value", 0),
        )
        items = []
        for goal in prefs.goals:
            metric = metrics.get(goal.metric, {"value": 0, "trend": "flat"})
            current = float(metric["value"])
            lower_is_better = goal.metric in ("ai_month", "monthly_churn")
            reached = (
                current <= goal.target if lower_is_better else current >= goal.target
            )
            projected = forecast_mrr if goal.metric == "mrr" else current
            items.append(
                {
                    "metric": goal.metric,
                    "label": goal.label,
                    "current": current,
                    "target": goal.target,
                    "difference": round(goal.target - current, 2),
                    "projected": round(projected, 2),
                    "trend": metric["trend"],
                    "reached": reached,
                }
            )
        return {"items": items, "freshness": summary["freshness"]}

    async def simulate(self, body: ScenarioInput):
        summary = await self.dashboard.summary()
        cash = await self.dashboard.cash_position()
        metrics = {x["key"]: x["value"] for x in summary["metrics"]}
        baseline = {
            "mrr": metrics["mrr"],
            "profit": metrics["recognized_revenue"]
            * metrics["contribution_margin"]
            / 100,
            "cash": cash["estimated_spendable_cash"],
            "margin_pct": metrics["contribution_margin"],
            "runway_months": metrics["estimated_runway"],
            "ltv": metrics["customer_ltv"],
        }
        projected = simulate_baseline(
            baseline["mrr"],
            baseline["profit"],
            baseline["cash"],
            metrics["ai_month"],
            int(metrics["paying_users"]),
            body,
        )
        return {
            "baseline": baseline,
            "projected": projected,
            "delta": {k: round(projected[k] - baseline[k], 2) for k in baseline},
            "assumptions": body.model_dump(),
            "warning": "Read-only scenario; no production data was modified.",
        }

    async def report_markdown(self):
        brief = await self.dashboard.executive_summary()
        forecast = await self.dashboard.forecasts()
        decisions = await self.decision_center()
        lines = [
            "# Bilkeys Weekly Executive Report",
            "",
            f"Generated: {datetime.now(UTC).isoformat()}",
            "",
            "## Executive Summary",
        ]
        lines += [f"- {x}" for x in brief["sentences"]]
        lines += ["", "## Forecasts"] + [
            f"- {x['label']}: {x['value']} ({x['confidence']} confidence)"
            for x in forecast["cards"]
        ]
        lines += ["", "## Priority Decisions"] + [
            f"- **{x['priority'].upper()} — {x['title']}**: {x['recommended_action']}"
            for x in decisions["items"]
        ]
        return "\n".join(lines)


def minimal_pdf(text: str) -> bytes:
    """Small dependency-free text PDF for audited executive exports."""
    lines = (
        text.replace("\\", "\\\\")
        .replace("(", "\\(")
        .replace(")", "\\)")
        .splitlines()[:55]
    )
    stream = (
        "BT /F1 10 Tf 40 760 Td 12 TL "
        + " ".join(f"({line[:100]}) Tj T*" for line in lines)
        + " ET"
    )
    objects = [
        "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
        "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
        "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >> endobj",
        f"4 0 obj << /Length {len(stream.encode())} >> stream\n{stream}\nendstream endobj",
        "5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
    ]
    out = BytesIO()
    out.write(b"%PDF-1.4\n")
    offsets = [0]
    for obj in objects:
        offsets.append(out.tell())
        out.write((obj + "\n").encode())
    xref = out.tell()
    out.write(f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode())
    for offset in offsets[1:]:
        out.write(f"{offset:010d} 00000 n \n".encode())
    out.write(
        f"trailer << /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF".encode()
    )
    return out.getvalue()
