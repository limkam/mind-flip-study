"""Owner dashboard calculations. All money is derived from canonical invoice facts."""

from collections import defaultdict
from datetime import UTC, datetime, timedelta

from repositories.owner_dashboard_repository import OwnerDashboardRepository
from services.financial_metrics_service import FinancialMetricsService, calculate_monthly_churn


def recognized_cents(invoice, start, end):
    net = max(0, invoice.amount_paid_cents - invoice.amount_refunded_cents)
    if (
        not invoice.period_start
        or not invoice.period_end
        or invoice.period_end <= invoice.period_start
    ):
        return net if invoice.paid_at and start <= invoice.paid_at < end else 0
    overlap = max(
        0,
        (
            min(invoice.period_end, end) - max(invoice.period_start, start)
        ).total_seconds(),
    )
    return round(
        net * overlap / (invoice.period_end - invoice.period_start).total_seconds()
    )


def change(current, previous):
    if current is None or previous is None:
        return None, "unavailable"
    pct = (
        None if previous == 0 else round((current - previous) / abs(previous) * 100, 1)
    )
    return pct, "up" if current > previous else "down" if current < previous else "flat"


def project_month(value, elapsed_days, month_days):
    return value / max(1, elapsed_days) * month_days


def customer_health_score(margin, ai_cost, status):
    return max(
        0,
        min(
            100,
            round(
                70
                + min(20, margin)
                - min(30, ai_cost)
                - (25 if status == "past_due" else 0)
            ),
        ),
    )


class OwnerDashboardService:
    def __init__(self, repo: OwnerDashboardRepository):
        self.repo = repo

    def periods(self):
        now = datetime.now(UTC)
        start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        prev_end = start
        prev_start = (start - timedelta(days=1)).replace(day=1)
        return now, start, prev_start, prev_end

    async def freshness(self):
        now = datetime.now(UTC)
        raw = await self.repo.freshness()
        latest = [x for x in raw.values() if x]
        return {
            "last_updated": now,
            **raw,
            "database_snapshot_time": now,
            "stale": not latest or max(latest) < now - timedelta(hours=24),
        }

    async def summary(self):
        now, start, prev_start, prev_end = self.periods()
        recurring = await FinancialMetricsService(self.repo.db).current_snapshot()
        invoices = await self.repo.invoices()
        current = sum(recognized_cents(x, start, now) for x in invoices) / 100
        previous = (
            sum(recognized_cents(x, prev_start, prev_end) for x in invoices) / 100
        )
        mrr = recurring.mrr
        payers = recurring.paying_users
        active = recurring.active_subscriptions
        ai_now = await self.repo.ai_cost(start, now)
        ai_prev = await self.repo.ai_cost(prev_start, prev_end)
        today = now.replace(hour=0, minute=0, second=0, microsecond=0)
        ai_today = await self.repo.ai_cost(today, now)
        lifetime = (
            sum(max(0, x.amount_paid_cents - x.amount_refunded_cents) for x in invoices)
            / 100
        )
        processing = (
            current * 0.029
            + len([x for x in invoices if x.paid_at and start <= x.paid_at < now])
            * 0.30
        )
        contribution = current - ai_now - processing
        margin = contribution / current * 100 if current else 0
        refunds_month = (
            sum(
                x.amount_refunded_cents
                for x in invoices
                if x.updated_at and start <= x.updated_at < now
            )
            / 100
        )
        _, failed_payments, _, _ = await self.repo.operational_counts(start)
        churn_now = await calculate_monthly_churn(self.repo.db, period_start=start, now=now)
        churn_prev = await calculate_monthly_churn(self.repo.db, period_start=prev_start, now=prev_end)
        defs = [
            (
                "mrr",
                "MRR",
                mrr,
                None,
                "currency",
                "Normalized monthly value of eligible active provider subscriptions.",
            ),
            (
                "arr",
                "ARR",
                recurring.arr,
                None,
                "currency",
                "Canonical subscription-normalized MRR multiplied by 12.",
            ),
            (
                "paying_users",
                "Paying Users",
                payers,
                None,
                "number",
                "Unique users with an active, trialing, or past-due canonical subscription.",
            ),
            (
                "active_subscriptions",
                "Active Subscriptions",
                active,
                None,
                "number",
                "Active, trialing, and past-due canonical subscription records.",
            ),
            (
                "arppu",
                "Subscription ARPPU",
                recurring.arppu,
                None,
                "currency",
                "Monthly recurring revenue divided by distinct paying users.",
            ),
            (
                "avg_margin",
                "Avg. Contribution Margin / User",
                contribution / payers if payers else 0,
                0,
                "currency",
                "Recognized revenue less AI and estimated processing cost, divided by paying users.",
            ),
            (
                "gross_margin",
                "Estimated Contribution Margin %",
                margin,
                0,
                "percent",
                "Recognized revenue less tracked AI and estimated processing costs, divided by recognized revenue.",
            ),
            (
                "lifetime_revenue",
                "Net Lifetime Cash Collected",
                lifetime,
                lifetime,
                "currency",
                "Paid invoice cash less recorded refunds, all time.",
            ),
            (
                "ai_month",
                "AI Spend This Month",
                ai_now,
                ai_prev,
                "currency",
                "Canonical estimated AI provider cost since month start.",
            ),
            (
                "ai_today",
                "AI Spend Today",
                ai_today,
                0,
                "currency",
                "Canonical estimated AI provider cost since 00:00 UTC.",
            ),
            (
                "recognized_revenue",
                "Recognized Revenue MTD",
                current,
                previous,
                "currency",
                "Revenue recognized during the service period, including prorated annual subscriptions.",
            ),
            (
                "net_revenue",
                "Estimated Net Recognized Revenue MTD",
                current - refunds_month,
                previous,
                "currency",
                "Recognized revenue less refunds recorded this month.",
            ),
            (
                "revenue_growth",
                "Revenue Growth",
                None,
                None,
                "percent",
                "Unavailable until like-for-like recognized-revenue comparison periods are implemented.",
            ),
            (
                "contribution_margin",
                "Contribution Margin %",
                margin,
                0,
                "percent",
                "Recognized revenue less AI and estimated variable processing cost, divided by revenue.",
            ),
            (
                "avg_ai_user",
                "Average AI Cost / User",
                ai_now / payers if payers else 0,
                ai_prev / payers if payers else 0,
                "currency",
                "Monthly AI spend divided by paying users.",
            ),
            (
                "avg_ai_document",
                "Average AI Cost / Document",
                None,
                None,
                "currency",
                "Document-level AI attribution is not stored canonically.",
            ),
            (
                "avg_ai_chapter",
                "Average AI Cost / Chapter",
                None,
                None,
                "currency",
                "Unavailable until canonical chapter attribution is stored.",
            ),
            (
                "customer_ltv",
                "Estimated Annual Contribution / Customer",
                contribution * 12 / payers if payers else 0,
                0,
                "currency",
                "Annualized average monthly customer contribution; an operating estimate.",
            ),
            (
                "monthly_churn",
                "Monthly Churn",
                churn_now.churn_rate_pct,
                churn_prev.churn_rate_pct,
                "percent",
                "Distinct customers who canceled this month divided by distinct customers already subscribed at month start.",
            ),
            (
                "failed_payments",
                "Failed Payments",
                failed_payments,
                0,
                "number",
                "Open or uncollectible canonical invoices this month.",
            ),
            (
                "refund_rate",
                "Refund Rate",
                refunds_month / current * 100 if current else 0,
                0,
                "percent",
                "Refunds recorded this month divided by recognized revenue.",
            ),
            (
                "burn_rate",
                "Known Tracked Operating Costs",
                ai_now + processing,
                ai_prev,
                "currency",
                "Known monthly variable burn: AI plus estimated payment processing. Payroll and fixed costs are not connected.",
            ),
            (
                "estimated_runway",
                "Estimated Runway From Known Tracked Costs",
                lifetime / max(1, ai_now + processing),
                0,
                "months",
                "Net collected invoice cash divided by known monthly variable burn; excludes unconnected fixed costs.",
            ),
        ]
        metrics = []
        unavailable = {
            "revenue_growth": "Like-for-like recognized-revenue comparison is unavailable.",
            "avg_ai_document": "Canonical document-level AI attribution is not stored.",
            "avg_ai_chapter": "Canonical chapter-level AI attribution is not stored.",
        }
        estimated = {
            "avg_margin",
            "gross_margin",
            "net_revenue",
            "contribution_margin",
            "customer_ltv",
            "burn_rate",
            "estimated_runway",
        }
        conflicted = {"mrr", "arr", "arppu", "paying_users", "active_subscriptions"}
        for key, label, val, prev, fmt, tip in defs:
            pct, trend = change(val, prev) if val is not None else (None, "unavailable")
            status = (
                "unavailable"
                if key in unavailable
                else "estimated"
                if key in estimated
                else "measured"
            )
            if recurring.includes_conflicts and key in conflicted:
                status = "conflicted"
            metrics.append(
                {
                    "key": key,
                    "label": label,
                    "value": round(val, 2) if val is not None else None,
                    "previous_value": round(prev, 2) if prev is not None else None,
                    "change_pct": pct,
                    "trend": trend,
                    "format": fmt,
                    "tooltip": tip,
                    "unit": "USD"
                    if fmt == "currency"
                    else "percent"
                    if fmt == "percent"
                    else "count"
                    if fmt == "number"
                    else "months",
                    "status": status,
                    "definition": tip,
                    "confidence": "low"
                    if status in ("estimated", "unavailable")
                    else "high",
                    "as_of": now,
                    "reason": unavailable.get(key),
                    "includes_conflicts": recurring.includes_conflicts
                    and key in conflicted,
                    "warning": f"Includes unresolved duplicate subscriptions affecting {recurring.conflict_users} customer(s)."
                    if recurring.includes_conflicts and key in conflicted
                    else None,
                }
            )
        return {
            "metrics": metrics,
            "cash_collected": round(lifetime, 2),
            "freshness": await self.freshness(),
        }

    async def cash_position(self):
        now, start, _, _ = self.periods()
        invoices = await self.repo.invoices()
        cash = (
            sum(max(0, x.amount_paid_cents - x.amount_refunded_cents) for x in invoices)
            / 100
        )
        deferred = (
            sum(
                max(
                    0,
                    (x.amount_paid_cents - x.amount_refunded_cents)
                    - recognized_cents(x, start, now),
                )
                for x in invoices
                if x.period_end and x.period_end > now
            )
            / 100
        )
        refund = cash * 0.05
        tax = cash * 0.20
        ops = 0
        payroll = 0
        infrastructure = await self.repo.ai_cost(start, now)
        buffer = max(1000, cash * 0.10)
        spend = max(
            0, cash - deferred - refund - tax - ops - payroll - infrastructure - buffer
        )
        return {
            "cash_available": round(cash, 2),
            "deferred_revenue": round(deferred, 2),
            "refund_dispute_reserve": round(refund, 2),
            "tax_reserve": round(tax, 2),
            "operating_liabilities": ops,
            "payroll_reserve": payroll,
            "infrastructure_reserve": round(infrastructure, 2),
            "minimum_cash_buffer": round(buffer, 2),
            "estimated_spendable_cash": round(spend, 2),
            "cash_runway_months": round(spend / max(1, infrastructure), 1),
            "assumptions": [
                "Cash available is net collected invoice cash, not a bank balance.",
                "Refund/dispute reserve: 5% of collected cash.",
                "Tax reserve: 20% of collected cash.",
                "Minimum buffer: greater of $1,000 or 10%; operating liabilities require a connected ledger.",
                "Infrastructure reserve uses current-month canonical AI cost; payroll is zero until a payroll ledger is connected.",
            ],
            "freshness": await self.freshness(),
        }

    async def unit_economics(self, **params):
        now, start, _, _ = self.periods()
        rows, total = await self.repo.unit_economics(start=start, end=now, **params)
        items = []
        for r in rows:
            revenue = float(r.revenue_cents) / 100
            ai = float(r.ai_cost)
            proc = revenue * 0.029 + int(r.payments) * 0.30
            storage = int(r.documents) * 0.02
            email = 0.01 if revenue else 0
            infrastructure = revenue * 0.03
            variable = ai + proc + storage + email + infrastructure
            margin = revenue - variable
            age_months = max(1, (now - (r.last_active_at or now)).days // 30 + 1)
            ltv = max(0, margin) * age_months
            health = customer_health_score(margin, ai, r.status)
            flags = []
            if margin < 0:
                flags.append("negative_margin")
            if ai > max(10, revenue * 0.5):
                flags.append("high_ai_cost")
            if r.last_active_at and r.last_active_at < now - timedelta(days=30):
                flags.append("inactive_paying")
            items.append(
                {
                    "user_id": r.id,
                    "user": r.full_name,
                    "email": r.email,
                    "plan": r.plan,
                    "billing_interval": r.billing_interval,
                    "recognized_revenue": round(revenue, 2),
                    "ai_cost": round(ai, 2),
                    "payment_processing_cost": round(proc, 2),
                    "storage_cost": round(storage, 2),
                    "email_cost": round(email, 2),
                    "infrastructure_cost": round(infrastructure, 2),
                    "total_variable_cost": round(variable, 2),
                    "contribution_margin": round(margin, 2),
                    "margin_pct": round(margin / revenue * 100, 1) if revenue else 0,
                    "documents": r.documents,
                    "chapters": 0,
                    "last_active": r.last_active_at,
                    "status": r.status,
                    "lifetime_value": round(ltv, 2),
                    "customer_health_score": health,
                    "flags": flags,
                }
            )
        return {
            "items": items,
            "total": total,
            "page": params["page"],
            "page_size": params["page_size"],
            "freshness": await self.freshness(),
        }

    async def alerts(self):
        now = datetime.now(UTC)
        counts = await self.repo.operational_counts(now - timedelta(days=7))
        specs = [
            (
                "webhooks",
                "critical",
                "Webhook failures",
                counts[0],
                "/admin/app-monitoring",
            ),
            (
                "payments",
                "high",
                "Failed payments",
                counts[1],
                "/admin/financial-analytics",
            ),
            (
                "duplicates",
                "high",
                "Duplicate subscriptions",
                counts[2],
                "/admin/owner-dashboard",
            ),
            (
                "missing-ai",
                "medium",
                "Missing AI attribution",
                counts[3],
                "/admin/ai-usage",
            ),
        ]
        items = [
            {
                "id": i,
                "severity": sev,
                "title": title,
                "description": f"{n} issue{'s' if n != 1 else ''} detected in canonical data during the last 7 days.",
                "first_detected": now - timedelta(days=7),
                "last_detected": now,
                "action_url": url,
                "acknowledged": False,
            }
            for i, sev, title, n, url in specs
            if n
        ]
        fresh = await self.freshness()
        if fresh["stale"]:
            items.append(
                {
                    "id": "sync-lag",
                    "severity": "critical",
                    "title": "Analytics synchronization lag",
                    "description": "Billing or AI telemetry has not synchronized in the last 24 hours.",
                    "first_detected": now,
                    "last_detected": now,
                    "action_url": "/admin/app-monitoring",
                    "acknowledged": False,
                }
            )
        return {"items": items, "freshness": fresh}

    async def user_detail(self, user_id):
        now, start, _, _ = self.periods()
        user, sub, invoices, usage = await self.repo.user_detail(user_id, start, now)
        if not user:
            return None
        grouped = {k: defaultdict(float) for k in ("provider", "model", "feature")}
        tokens = {"input": 0, "output": 0, "cache": 0}
        recent = []
        for x in usage:
            cost = float(x.estimated_cost_usd or 0)
            grouped["provider"][x.provider or "unknown"] += cost
            grouped["model"][x.model or "unknown"] += cost
            grouped["feature"][x.feature_type or x.task or "unknown"] += cost
            tokens["input"] += x.input_tokens
            tokens["output"] += x.output_tokens
            tokens["cache"] += (
                x.cached_tokens + x.cache_read_tokens + x.cache_creation_tokens
            )
            recent.append(
                {
                    "request_id": x.provider_request_id or str(x.id),
                    "provider": x.provider,
                    "model": x.model,
                    "feature": x.feature_type or x.task,
                    "input_tokens": x.input_tokens,
                    "output_tokens": x.output_tokens,
                    "cache_tokens": x.cached_tokens
                    + x.cache_read_tokens
                    + x.cache_creation_tokens,
                    "latency_ms": x.duration_ms,
                    "provider_cost": None,
                    "estimated_cost": cost,
                    "status": x.status,
                    "retry_count": int((x.call_metadata or {}).get("retry_count", 0)),
                    "created_at": x.created_at.isoformat(),
                }
            )
        recognized = sum(recognized_cents(x, start, now) for x in invoices) / 100
        ai = sum(
            float(x.estimated_cost_usd or 0)
            for x in usage
            if start <= x.created_at < now
        )
        documents = 0
        return {
            "profile": {
                "id": str(user.id),
                "name": user.full_name,
                "email": user.email,
                "country": user.country,
                "last_active": user.last_active_at,
            },
            "subscription": (
                {
                    "plan": sub[1].name,
                    "status": sub[0].status,
                    "billing_interval": sub[0].billing_interval,
                    "period_end": sub[0].current_period_end,
                }
                if sub
                else None
            ),
            "payment_history": [
                {
                    "id": x.stripe_invoice_id,
                    "status": x.status,
                    "paid": x.amount_paid_cents / 100,
                    "refunded": x.amount_refunded_cents / 100,
                    "paid_at": x.paid_at,
                }
                for x in invoices
            ],
            "recognized_revenue": round(recognized, 2),
            "ai_cost_by_provider": [
                {"label": k, "cost": round(v, 4)}
                for k, v in grouped["provider"].items()
            ],
            "ai_cost_by_model": [
                {"label": k, "cost": round(v, 4)} for k, v in grouped["model"].items()
            ],
            "ai_cost_by_feature": [
                {"label": k, "cost": round(v, 4)} for k, v in grouped["feature"].items()
            ],
            "token_usage": tokens,
            "average_cost_per_document": round(ai / documents, 4) if documents else 0,
            "average_cost_per_chapter": 0,
            "margin_trend": [],
            "failed_payments": sum(
                x.status in ("open", "uncollectible") for x in invoices
            ),
            "refunds": sum(x.amount_refunded_cents for x in invoices) / 100,
            "subscription_conflicts": False,
            "recent_ai_activity": recent[:25],
            "recent_uploads": [],
            "recent_generations": [x for x in recent if x["status"] == "succeeded"][
                :10
            ],
        }

    def range_start(self, range_name, now):
        return now - timedelta(
            days={"7d": 7, "30d": 30, "90d": 90, "12m": 365, "lifetime": 3650}.get(
                range_name, 30
            )
        )

    async def intelligence(self, range_name="30d"):
        now = datetime.now(UTC)
        data = await self.repo.analytics(self.range_start(range_name, now), now)
        daily = [
            {
                "date": r.bucket.date().isoformat(),
                "cost": round(float(r.cost or 0), 4),
                "requests": int(r.requests or 0),
                "average_tokens": round(float(r.tokens or 0)),
                "average_latency_ms": round(float(r.latency or 0)),
                "failure_rate": round(
                    int(r.failures or 0) / max(1, int(r.requests or 0)) * 100, 1
                ),
                "cache_hit_rate": round(
                    int(r.cache_hits or 0) / max(1, int(r.requests or 0)) * 100, 1
                ),
            }
            for r in data["ai_daily"]
        ]

        def groups(key):
            return [
                {
                    "label": r.label or "Unknown",
                    "cost": round(float(r.cost or 0), 4),
                    "requests": int(r.requests or 0),
                }
                for r in data[key]
            ]

        total_cost = sum(x["cost"] for x in daily)
        total_requests = sum(x["requests"] for x in daily)
        providers, models, features = (
            groups("providers"),
            groups("models"),
            groups("features"),
        )
        insights = []
        if providers and total_cost:
            insights.append(
                f"{providers[0]['label']} accounts for {providers[0]['cost'] / total_cost * 100:.0f}% of AI spending."
            )
        if models:
            insights.append(
                f"{models[0]['label']} is the most expensive model at {models[0]['cost']:.2f} USD in this period."
            )
        failure = sum(x["failure_rate"] * x["requests"] for x in daily) / max(
            1, total_requests
        )
        if failure > 2:
            insights.append(
                f"AI request failures are {failure:.1f}%; investigate retries and provider errors."
            )

        def weighted(key):
            return round(
                sum(x[key] * x["requests"] for x in daily) / max(1, total_requests),
                1,
            )

        return {
            "range": range_name,
            "spend_by_provider": providers,
            "spend_by_model": models,
            "spend_by_feature": features,
            "daily_spend": daily,
            "cost_per_request": round(total_cost / max(1, total_requests), 4),
            "average_tokens": weighted("average_tokens"),
            "average_latency_ms": weighted("average_latency_ms"),
            "failure_rate": round(failure, 1),
            "cache_hit_rate": weighted("cache_hit_rate"),
            "optimization_opportunities": insights,
            "freshness": await self.freshness(),
        }

    async def revenue_analytics(self, range_name="30d"):
        now = datetime.now(UTC)
        data = await self.repo.analytics(self.range_start(range_name, now), now)
        daily = [
            {
                "date": r.bucket.date().isoformat(),
                "revenue": round(float(r.net or 0) / 100, 2),
            }
            for r in data["revenue_daily"]
        ]
        running = 0
        for point in daily:
            running += point["revenue"]
            point["recognized_revenue"] = round(running, 2)
        return {
            "range": range_name,
            "daily": daily,
            "by_plan": [
                {"label": r.label, "value": round(float(r.net or 0) / 100, 2)}
                for r in data["plans"]
            ],
            "by_country": [
                {"label": r.label, "value": round(float(r.net or 0) / 100, 2)}
                for r in data["countries"]
            ],
            "freshness": await self.freshness(),
        }

    async def forecasts(self):
        now, start, prev_start, prev_end = self.periods()
        invoices = await self.repo.invoices()
        elapsed = max(1, (now - start).days + 1)
        days = ((start + timedelta(days=32)).replace(day=1) - start).days
        revenue = sum(recognized_cents(x, start, now) for x in invoices) / 100
        prior = sum(recognized_cents(x, prev_start, prev_end) for x in invoices) / 100
        ai = await self.repo.ai_cost(start, now)
        cash = await self.cash_position()
        renewals = await self.repo.renewals(now, now + timedelta(days=30))
        renewal_value = sum(float(r.unit_amount_cents or 0) / 100 for r in renewals)
        projected_revenue = project_month(revenue, elapsed, days)
        projected_ai = project_month(ai, elapsed, days)
        confidence = "high" if elapsed >= 14 else "medium" if elapsed >= 7 else "low"
        cards = [
            (
                "revenue",
                "Projected Month-End Recognized Revenue",
                projected_revenue,
                "currency",
                confidence,
            ),
            ("ai", "Projected EOM AI Cost", projected_ai, "currency", confidence),
            (
                "cash",
                "Projected Cash Position",
                cash["cash_available"] + renewal_value - projected_ai,
                "currency",
                "low",
            ),
            (
                "payouts",
                "Stripe Payout Forecast",
                renewal_value * 0.971,
                "currency",
                "medium",
            ),
            (
                "runway",
                "Cash Runway",
                cash["estimated_spendable_cash"] / max(1, projected_ai),
                "months",
                "low",
            ),
        ]
        return {
            "cards": [
                {
                    "key": k,
                    "label": label,
                    "value": round(value, 2),
                    "format": fmt,
                    "confidence": conf,
                    "status": "projected",
                    "method": "month-to-date daily run-rate"
                    if k in ("revenue", "ai")
                    else "operating estimate",
                    "warning": "Assumes the current daily pace continues through month end."
                    if k in ("revenue", "ai")
                    else None,
                    "recognized_revenue_mtd": round(revenue, 2)
                    if k == "revenue"
                    else None,
                    "elapsed_days": elapsed if k == "revenue" else None,
                    "days_in_month": days if k == "revenue" else None,
                }
                for k, label, value, fmt, conf in cards
            ],
            "deferred_release": [],
            "renewals": [
                {
                    "date": r.current_period_end,
                    "customer": r.full_name,
                    "plan": r.name,
                    "amount": float(r.unit_amount_cents or 0) / 100,
                }
                for r in renewals
            ],
            "historical_basis": {
                "current_revenue": round(revenue, 2),
                "prior_month_revenue": round(prior, 2),
                "elapsed_days": elapsed,
            },
            "freshness": await self.freshness(),
        }

    async def executive_summary(self):
        summary = await self.summary()
        cash = await self.cash_position()
        alerts = await self.alerts()
        units = await self.unit_economics(
            page=1,
            page_size=100,
            search=None,
            status=None,
            segment=None,
            sort="contribution_margin",
            direction="asc",
        )
        metrics = {m["key"]: m for m in summary["metrics"]}
        negative = sum("negative_margin" in x["flags"] for x in units["items"])
        failed = any(a["id"] == "payments" for a in alerts["items"])
        sentences = [
            f"MRR is {metrics['mrr']['trend']} {abs(metrics['mrr']['change_pct'] or 0):.1f}% versus the previous month.",
            f"Revenue is tracking at {metrics['mrr']['value']:.2f} USD MRR.",
            f"{negative} customers currently have negative contribution margins.",
            f"AI spend this month is {metrics['ai_month']['value']:.2f} USD.",
            "Failed payments require follow-up."
            if failed
            else "No failed-payment alert is open.",
            "Stripe synchronization is stale."
            if summary["freshness"]["stale"]
            else "Stripe synchronization is healthy.",
            f"Estimated spendable cash is {cash['estimated_spendable_cash']:.2f} USD.",
        ]
        actions = []
        if negative:
            actions.append(
                "Review negative-margin customers and constrain unusually expensive AI workflows."
            )
        if failed:
            actions.append("Follow up on failed payments today.")
        return {
            "title": "Today's Summary",
            "sentences": sentences,
            "recommendations": actions
            or ["No urgent executive action is indicated by current canonical data."],
            "freshness": summary["freshness"],
        }
