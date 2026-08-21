"""Owner Console (read-only) metrics — Modules 1-9.

Each public function backs exactly one module's dashboard endpoint in
routers/owner_console.py. Deliberately independent of OwnerDashboardService's heavier
per-user drill-down machinery — these are console-wide rollups, not per-user detail.
"""

import csv
import io
from collections import defaultdict
from datetime import UTC, datetime, timedelta

from sqlalchemy import case, select
from sqlalchemy import func as sa_func
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from models.admin_observability import AdminAuditLog
from models.alerts import AlertEvent
from models.billing_analytics import BillingEvent, BillingInvoice, SubscriptionPlanChangeEvent
from models.book import Book
from models.compliance import DmcaNotice, PrivacyRequest
from models.credit_purchase import CreditPurchase
from models.email import EmailJob
from models.enums import BookStatus, UserRole
from models.engagement import LearningStreak
from models.native_session import NativeRefreshSession
from models.plan import Plan
from models.security_events import SystemSecurityEvent
from models.token_usage import TokenUsage
from models.user import User
from models.user_subscription import UserSubscription
from models.xp import XPTransaction
from repositories.owner_dashboard_repository import OwnerDashboardRepository
from schemas.owner_console import (
    ActiveAdminCount,
    AdminActionCount,
    AdminRoleCount,
    AiCostPercentile,
    AiSpendVsRevenuePoint,
    AlertBreachItem,
    AlertsOut,
    AlertThresholdStatus,
    AssumedVsMeasuredItem,
    AttributionFunnelItem,
    AttributionOut,
    BillingIntervalMixItem,
    CampaignPerformanceItem,
    CancellationReasonItem,
    CashOut,
    ChannelCostItem,
    ChannelEconomicsItem,
    CohortRetentionPoint,
    ComplianceOut,
    ContentFlagItem,
    ConversionSuccessRate,
    DayTwoReviewByChannel,
    DmcaNoticeItem,
    DunningStageBucket,
    DuplicateIpSignal,
    GovernanceOut,
    GuardrailEventItem,
    InfraSpendOut,
    MRRMovementPoint,
    OperationalHealth,
    PlanMarginItem,
    PlanMixItem,
    PrivacyRequestItem,
    ProcessingTimeStats,
    RetentionOut,
    RevenueOut,
    RevokedSessionStats,
    SecurityEventCount,
    StreakBucket,
    TechnicalOut,
    TrialReminderLogItem,
    UnderageBlockedPoint,
    UnitEconomicsOut,
    UpcomingRenewal,
)
from services.financial_metrics_service import FinancialMetricsService, calculate_monthly_churn
from services.owner_dashboard_service import OwnerDashboardService

MARGIN_TARGET_PCT = 70.0
UNATTRIBUTED_CHANNEL = "organic/unattributed"

# Target subscriber-mix shares per plan (Module 1's 30/45/25 target). Update here if the
# target model changes — there's no other source of truth for it today.
PLAN_MIX_TARGETS_PCT = {"quick_72": 30.0, "standard_15": 45.0, "premium_30": 25.0}

EXTRA_CREDIT_MRR_ALERT_THRESHOLD_PCT = 15.0

_MONTHLY_CENTS_EXPR = case(
    (UserSubscription.billing_interval == "annual", UserSubscription.unit_amount_cents / 12.0),
    else_=UserSubscription.unit_amount_cents,
)


def _month_bounds(months_ago: int, *, now: datetime) -> tuple[datetime, datetime, str]:
    first_of_this_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    year = first_of_this_month.year
    month = first_of_this_month.month - months_ago
    while month <= 0:
        month += 12
        year -= 1
    start = first_of_this_month.replace(year=year, month=month)
    end = start.replace(year=year + 1, month=1) if month == 12 else start.replace(month=month + 1)
    return start, end, f"{start.year}-{start.month:02d}"


def _eligible_now_clause(now: datetime):
    return (
        UserSubscription.status == "active",
        UserSubscription.current_period_end.is_not(None),
        UserSubscription.current_period_end > now,
    )


async def _plan_mix(db: AsyncSession, eligible_now) -> list[PlanMixItem]:
    plan_rows = (
        await db.execute(
            select(Plan.slug, Plan.name, sa_func.count(UserSubscription.id))
            .join(UserSubscription, UserSubscription.plan_id == Plan.id)
            .where(*eligible_now)
            .group_by(Plan.slug, Plan.name)
        )
    ).all()
    total_subscribers = sum(int(r[2]) for r in plan_rows)
    return [
        PlanMixItem(
            plan_slug=slug,
            plan_name=name,
            subscribers=int(count),
            pct_of_total=round(int(count) / total_subscribers * 100, 1) if total_subscribers else 0.0,
            target_pct=PLAN_MIX_TARGETS_PCT.get(slug),
        )
        for slug, name, count in plan_rows
    ]


async def revenue_metrics(db: AsyncSession) -> RevenueOut:
    now = datetime.now(UTC)
    snapshot = await FinancialMetricsService(db).current_snapshot()

    months = [_month_bounds(i, now=now) for i in range(5, -1, -1)]
    movements: list[MRRMovementPoint] = []
    for start, end, label in months:
        new_cents = (
            await db.scalar(
                select(sa_func.coalesce(sa_func.sum(_MONTHLY_CENTS_EXPR), 0)).where(
                    UserSubscription.subscription_started_at >= start,
                    UserSubscription.subscription_started_at < end,
                )
            )
            or 0
        )
        churned_cents = (
            await db.scalar(
                select(sa_func.coalesce(sa_func.sum(_MONTHLY_CENTS_EXPR), 0)).where(
                    UserSubscription.canceled_at >= start,
                    UserSubscription.canceled_at < end,
                )
            )
            or 0
        )
        expansion_cents = (
            await db.scalar(
                select(
                    sa_func.coalesce(
                        sa_func.sum(
                            SubscriptionPlanChangeEvent.new_mrr_cents - SubscriptionPlanChangeEvent.old_mrr_cents
                        ),
                        0,
                    )
                ).where(
                    SubscriptionPlanChangeEvent.changed_at >= start,
                    SubscriptionPlanChangeEvent.changed_at < end,
                    SubscriptionPlanChangeEvent.new_mrr_cents > SubscriptionPlanChangeEvent.old_mrr_cents,
                )
            )
            or 0
        )
        contraction_cents = (
            await db.scalar(
                select(
                    sa_func.coalesce(
                        sa_func.sum(
                            SubscriptionPlanChangeEvent.new_mrr_cents - SubscriptionPlanChangeEvent.old_mrr_cents
                        ),
                        0,
                    )
                ).where(
                    SubscriptionPlanChangeEvent.changed_at >= start,
                    SubscriptionPlanChangeEvent.changed_at < end,
                    SubscriptionPlanChangeEvent.new_mrr_cents < SubscriptionPlanChangeEvent.old_mrr_cents,
                )
            )
            or 0
        )
        new_usd = round(float(new_cents) / 100, 2)
        churned_usd = -round(float(churned_cents) / 100, 2)
        expansion_usd = round(float(expansion_cents) / 100, 2)
        contraction_usd = round(float(contraction_cents) / 100, 2)
        movements.append(
            MRRMovementPoint(
                month=label,
                new_mrr_usd=new_usd,
                expansion_mrr_usd=expansion_usd,
                contraction_mrr_usd=contraction_usd,
                churned_mrr_usd=churned_usd,
                net_mrr_usd=round(new_usd + expansion_usd + contraction_usd + churned_usd, 2),
            )
        )

    eligible_now = _eligible_now_clause(now)
    plan_mix = await _plan_mix(db, eligible_now)

    interval_rows = (
        await db.execute(
            select(UserSubscription.billing_interval, sa_func.count(UserSubscription.id))
            .where(*eligible_now)
            .group_by(UserSubscription.billing_interval)
        )
    ).all()
    interval_total = sum(int(r[1]) for r in interval_rows)
    billing_interval_mix = [
        BillingIntervalMixItem(
            interval=interval or "unknown",
            subscribers=int(count),
            pct_of_total=round(int(count) / interval_total * 100, 1) if interval_total else 0.0,
        )
        for interval, count in interval_rows
    ]

    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    extra_credit_cents = (
        await db.scalar(
            select(sa_func.coalesce(sa_func.sum(CreditPurchase.amount_paid_cents), 0)).where(
                CreditPurchase.status == "completed",
                CreditPurchase.created_at >= month_start,
            )
        )
        or 0
    )
    extra_credit_usd = round(float(extra_credit_cents) / 100, 2)
    extra_credit_pct = round(extra_credit_usd / snapshot.mrr * 100, 1) if snapshot.mrr else 0.0

    return RevenueOut(
        updated_at=now,
        mrr_usd=snapshot.mrr,
        arr_usd=snapshot.arr,
        mrr_movements=movements,
        plan_mix=plan_mix,
        billing_interval_mix=billing_interval_mix,
        extra_credit_revenue_usd=extra_credit_usd,
        extra_credit_pct_of_mrr=extra_credit_pct,
        extra_credit_alert=extra_credit_pct > EXTRA_CREDIT_MRR_ALERT_THRESHOLD_PCT,
    )


async def cash_metrics(db: AsyncSession) -> CashOut:
    now = datetime.now(UTC)
    dashboard = OwnerDashboardService(OwnerDashboardRepository(db))
    cash = await dashboard.cash_position()

    renewal_rows = await dashboard.repo.renewals(now, now + timedelta(days=30))
    upcoming_renewals = [
        UpcomingRenewal(
            date=r.current_period_end,
            customer=r.full_name,
            plan=r.name,
            amount_usd=round(float(r.unit_amount_cents or 0) / 100, 2),
        )
        for r in renewal_rows
    ]

    dunning_rows = (
        await db.execute(
            select(
                UserSubscription.dunning_stage,
                sa_func.count(UserSubscription.id),
                sa_func.coalesce(sa_func.sum(_MONTHLY_CENTS_EXPR), 0),
            )
            .where(UserSubscription.dunning_stage > 0)
            .group_by(UserSubscription.dunning_stage)
            .order_by(UserSubscription.dunning_stage)
        )
    ).all()
    dunning_pipeline = [
        DunningStageBucket(
            stage=int(stage),
            subscriptions=int(count),
            mrr_at_risk_usd=round(float(mrr_cents) / 100, 2),
        )
        for stage, count, mrr_cents in dunning_rows
    ]

    return CashOut(
        updated_at=now,
        cash_available=cash["cash_available"],
        deferred_revenue=cash["deferred_revenue"],
        refund_dispute_reserve=cash["refund_dispute_reserve"],
        tax_reserve=cash["tax_reserve"],
        operating_liabilities=cash["operating_liabilities"],
        payroll_reserve=cash["payroll_reserve"],
        infrastructure_reserve=cash["infrastructure_reserve"],
        minimum_cash_buffer=cash["minimum_cash_buffer"],
        estimated_spendable_cash=cash["estimated_spendable_cash"],
        cash_runway_months=cash["cash_runway_months"],
        assumptions=cash["assumptions"],
        upcoming_renewals=upcoming_renewals,
        upcoming_renewals_total_usd=round(sum(r.amount_usd for r in upcoming_renewals), 2),
        dunning_pipeline=dunning_pipeline,
    )


async def unit_economics_metrics(db: AsyncSession) -> UnitEconomicsOut:
    now = datetime.now(UTC)
    dashboard = OwnerDashboardService(OwnerDashboardRepository(db))
    # Reuses the exact per-user margin formula already live on the Owner Dashboard's Unit
    # Economics table (owner_dashboard_service.py unit_economics()) rather than a second,
    # potentially-diverging cost model — this just rolls those same per-user numbers up.
    result = await dashboard.unit_economics(
        search=None, status=None, segment=None,
        sort="recognized_revenue", direction="desc", page=1, page_size=100_000,
    )
    items = result["items"]

    plan_buckets: dict[str, dict] = {}
    for item in items:
        plan = item["plan"] or "unknown"
        b = plan_buckets.setdefault(plan, {"revenue": 0.0, "margin": 0.0, "count": 0})
        b["revenue"] += item["recognized_revenue"]
        b["margin"] += item["contribution_margin"]
        b["count"] += 1
    plan_margins = [
        PlanMarginItem(
            plan=plan,
            paying_users=b["count"],
            recognized_revenue_usd=round(b["revenue"], 2),
            contribution_margin_usd=round(b["margin"], 2),
            margin_pct=round(b["margin"] / b["revenue"] * 100, 1) if b["revenue"] else 0.0,
        )
        for plan, b in plan_buckets.items()
    ]

    user_ids = [item["user_id"] for item in items]
    channel_map: dict = {}
    if user_ids:
        rows = (await db.execute(select(User.id, User.utm_source).where(User.id.in_(user_ids)))).all()
        channel_map = {uid: (src or UNATTRIBUTED_CHANNEL) for uid, src in rows}
    channel_buckets: dict[str, dict] = {}
    for item in items:
        channel = channel_map.get(item["user_id"], UNATTRIBUTED_CHANNEL)
        b = channel_buckets.setdefault(channel, {"ltv_sum": 0.0, "count": 0})
        b["ltv_sum"] += item["lifetime_value"]
        b["count"] += 1
    channel_economics = [
        ChannelEconomicsItem(
            channel=channel,
            paying_users=b["count"],
            avg_ltv_usd=round(b["ltv_sum"] / b["count"], 2) if b["count"] else 0.0,
        )
        for channel, b in channel_buckets.items()
    ]

    churn = await calculate_monthly_churn(
        db, period_start=now.replace(day=1, hour=0, minute=0, second=0, microsecond=0), now=now
    )

    eligible_now = _eligible_now_clause(now)
    plan_mix = await _plan_mix(db, eligible_now)

    thirty_days_ago = now - timedelta(days=30)
    call_counts = (
        select(TokenUsage.user_id, sa_func.count(TokenUsage.id).label("calls"))
        .where(TokenUsage.created_at >= thirty_days_ago)
        .group_by(TokenUsage.user_id)
        .subquery()
    )
    usage_p50, usage_p95 = (
        await db.execute(
            select(
                sa_func.coalesce(sa_func.percentile_cont(0.5).within_group(call_counts.c.calls), 0),
                sa_func.coalesce(sa_func.percentile_cont(0.95).within_group(call_counts.c.calls), 0),
            )
        )
    ).one()

    cohort_start = now - timedelta(days=60)
    cohort_end = now - timedelta(days=30)
    cohort_ids = select(User.id).where(User.created_at >= cohort_start, User.created_at < cohort_end).subquery()
    cohort_total = int(await db.scalar(select(sa_func.count()).select_from(cohort_ids)) or 0)
    cohort_converted = int(
        await db.scalar(
            select(sa_func.count(sa_func.distinct(UserSubscription.user_id))).where(
                UserSubscription.user_id.in_(select(cohort_ids.c.id)),
                UserSubscription.subscription_started_at.is_not(None),
            )
        )
        or 0
    )
    conversion_pct = round(cohort_converted / cohort_total * 100, 1) if cohort_total else 0.0

    assumed_vs_measured = [
        AssumedVsMeasuredItem(metric="Monthly churn", unit="%", measured_value=churn.churn_rate_pct),
        AssumedVsMeasuredItem(
            metric="Plan mix (largest plan share)",
            unit="%",
            measured_value=max((p.pct_of_total for p in plan_mix), default=0.0),
        ),
        AssumedVsMeasuredItem(metric="AI usage rate p50 (calls/30d)", unit="calls", measured_value=float(usage_p50 or 0)),
        AssumedVsMeasuredItem(metric="AI usage rate p95 (calls/30d)", unit="calls", measured_value=float(usage_p95 or 0)),
        AssumedVsMeasuredItem(
            metric="Signup→paid conversion (30-60d cohort)", unit="%", measured_value=conversion_pct
        ),
    ]

    return UnitEconomicsOut(
        updated_at=now,
        margin_target_pct=MARGIN_TARGET_PCT,
        plan_margins=plan_margins,
        channel_economics=channel_economics,
        cac_note=(
            "CAC, LTV:CAC, and payback period require a connected ad-spend source (no marketing "
            "spend ledger exists in this system yet) — shown here is paying-customer count and "
            "average LTV per acquisition channel only, using utm_source captured at signup."
        ),
        assumed_vs_measured=assumed_vs_measured,
    )


async def retention_metrics(db: AsyncSession) -> RetentionOut:
    now = datetime.now(UTC)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    churn = await calculate_monthly_churn(db, period_start=month_start, now=now)

    reason_rows = (
        await db.execute(
            select(UserSubscription.cancellation_reason, sa_func.count(UserSubscription.id))
            .where(UserSubscription.canceled_at >= month_start, UserSubscription.canceled_at <= now)
            .group_by(UserSubscription.cancellation_reason)
        )
    ).all()
    cancellation_reasons = [
        CancellationReasonItem(reason=reason or "not specified", count=int(count)) for reason, count in reason_rows
    ]

    # Day-2 review completion by acquisition source. Cohort needs day 2 to have already
    # happened, so only users who signed up 2-60 days ago are included.
    cohort_start = now - timedelta(days=60)
    cohort_end = now - timedelta(days=2)
    cohort_users = (
        await db.execute(
            select(User.id, User.created_at, User.utm_source).where(
                User.created_at >= cohort_start, User.created_at < cohort_end
            )
        )
    ).all()
    reviews_by_user: dict = defaultdict(list)
    if cohort_users:
        user_ids = [row[0] for row in cohort_users]
        review_rows = (
            await db.execute(
                select(XPTransaction.user_id, XPTransaction.created_at).where(
                    XPTransaction.user_id.in_(user_ids),
                    XPTransaction.source_type == "daily_review",
                )
            )
        ).all()
        for uid, created_at in review_rows:
            reviews_by_user[uid].append(created_at)
    channel_buckets: dict[str, dict] = {}
    for uid, created_at, utm_source in cohort_users:
        channel = utm_source or UNATTRIBUTED_CHANNEL
        b = channel_buckets.setdefault(channel, {"cohort": 0, "completed": 0})
        b["cohort"] += 1
        day2_date = (created_at + timedelta(days=1)).date()
        if any(r.date() == day2_date for r in reviews_by_user.get(uid, [])):
            b["completed"] += 1
    day2_review_by_channel = [
        DayTwoReviewByChannel(
            channel=channel,
            cohort_size=b["cohort"],
            completed_day2_review=b["completed"],
            completion_pct=round(b["completed"] / b["cohort"] * 100, 1) if b["cohort"] else 0.0,
        )
        for channel, b in channel_buckets.items()
    ]

    cohort_retention: list[CohortRetentionPoint] = []
    for start, end, label in [_month_bounds(i, now=now) for i in range(5, -1, -1)]:
        subs = (
            await db.execute(
                select(UserSubscription.subscription_started_at, UserSubscription.canceled_at).where(
                    UserSubscription.subscription_started_at >= start,
                    UserSubscription.subscription_started_at < end,
                )
            )
        ).all()
        cohort_size = len(subs)
        for week in range(1, 9):
            eligible = [row for row in subs if row[0] + timedelta(weeks=week) <= now]
            if not eligible:
                continue
            retained = sum(
                1 for started_at, canceled_at in eligible if canceled_at is None or canceled_at >= started_at + timedelta(weeks=week)
            )
            cohort_retention.append(
                CohortRetentionPoint(
                    cohort_month=label,
                    cohort_size=cohort_size,
                    week=week,
                    retained_pct=round(retained / len(eligible) * 100, 1),
                )
            )

    streak_rows = (await db.execute(select(LearningStreak.current_streak))).all()
    bucket_defs = [
        ("0", lambda s: s == 0),
        ("1-2", lambda s: 1 <= s <= 2),
        ("3-6", lambda s: 3 <= s <= 6),
        ("7-13", lambda s: 7 <= s <= 13),
        ("14-29", lambda s: 14 <= s <= 29),
        ("30+", lambda s: s >= 30),
    ]
    bucket_counts = {label: 0 for label, _ in bucket_defs}
    for (streak,) in streak_rows:
        for label, predicate in bucket_defs:
            if predicate(streak):
                bucket_counts[label] += 1
                break
    streak_distribution = [StreakBucket(bucket=label, users=bucket_counts[label]) for label, _ in bucket_defs]

    ever_paying = select(UserSubscription.user_id).where(UserSubscription.subscription_started_at.is_not(None)).distinct()
    currently_active = select(UserSubscription.user_id).where(*_eligible_now_clause(now)).distinct()
    lapsed_user_backlog = int(
        await db.scalar(
            select(sa_func.count()).select_from(
                ever_paying.where(UserSubscription.user_id.not_in(currently_active)).subquery()
            )
        )
        or 0
    )

    lapse_cohort_start = now - timedelta(days=120)
    lapse_cohort_end = now - timedelta(days=60)
    lapsed_cohort = (
        await db.execute(
            select(UserSubscription.user_id, UserSubscription.canceled_at).where(
                UserSubscription.canceled_at >= lapse_cohort_start,
                UserSubscription.canceled_at < lapse_cohort_end,
            )
        )
    ).all()
    renewed = 0
    if lapsed_cohort:
        lapsed_user_ids = [row[0] for row in lapsed_cohort]
        later_subs = (
            await db.execute(
                select(UserSubscription.user_id, UserSubscription.subscription_started_at).where(
                    UserSubscription.user_id.in_(lapsed_user_ids),
                    UserSubscription.subscription_started_at.is_not(None),
                )
            )
        ).all()
        later_by_user: dict = defaultdict(list)
        for uid, started_at in later_subs:
            later_by_user[uid].append(started_at)
        for uid, canceled_at in lapsed_cohort:
            window_end = canceled_at + timedelta(days=60)
            if any(canceled_at < started_at <= window_end for started_at in later_by_user.get(uid, [])):
                renewed += 1
    lapsed_to_renewed_60d_pct = round(renewed / len(lapsed_cohort) * 100, 1) if lapsed_cohort else 0.0

    return RetentionOut(
        updated_at=now,
        monthly_churn_rate_pct=churn.churn_rate_pct,
        cancellation_reasons=cancellation_reasons,
        day2_review_by_channel=day2_review_by_channel,
        cohort_retention=cohort_retention,
        streak_distribution=streak_distribution,
        lapsed_user_backlog=lapsed_user_backlog,
        lapsed_to_renewed_60d_pct=lapsed_to_renewed_60d_pct,
    )


ATTRIBUTION_WINDOW_DAYS = 90


async def attribution_metrics(db: AsyncSession) -> AttributionOut:
    now = datetime.now(UTC)
    window_start = now - timedelta(days=ATTRIBUTION_WINDOW_DAYS)

    paying_user_ids = (
        select(UserSubscription.user_id).where(UserSubscription.subscription_started_at.is_not(None)).distinct()
    )

    signup_rows = (
        await db.execute(
            select(
                User.utm_source,
                sa_func.count(User.id),
                sa_func.sum(case((User.onboarding_completed.is_(True), 1), else_=0)),
            )
            .where(User.created_at >= window_start)
            .group_by(User.utm_source)
        )
    ).all()
    paying_rows = (
        await db.execute(
            select(User.utm_source, sa_func.count(User.id))
            .where(User.created_at >= window_start, User.id.in_(paying_user_ids))
            .group_by(User.utm_source)
        )
    ).all()
    paying_by_channel = {(src or UNATTRIBUTED_CHANNEL): int(count) for src, count in paying_rows}

    funnel_by_channel = []
    for src, signups, activated in signup_rows:
        channel = src or UNATTRIBUTED_CHANNEL
        signups = int(signups)
        activated = int(activated or 0)
        paying = paying_by_channel.get(channel, 0)
        funnel_by_channel.append(
            AttributionFunnelItem(
                channel=channel,
                signups=signups,
                activated=activated,
                paying=paying,
                activation_pct=round(activated / signups * 100, 1) if signups else 0.0,
                paying_pct=round(paying / signups * 100, 1) if signups else 0.0,
            )
        )

    cost_per_channel = [
        ChannelCostItem(channel=item.channel, paying_subscribers=item.paying, cost_per_paying_subscriber_usd=None)
        for item in funnel_by_channel
    ]

    campaign_signup_rows = (
        await db.execute(
            select(User.utm_campaign, sa_func.count(User.id))
            .where(User.created_at >= window_start, User.utm_campaign.is_not(None))
            .group_by(User.utm_campaign)
        )
    ).all()
    campaign_paying_rows = (
        await db.execute(
            select(User.utm_campaign, sa_func.count(User.id))
            .where(
                User.created_at >= window_start,
                User.utm_campaign.is_not(None),
                User.id.in_(paying_user_ids),
            )
            .group_by(User.utm_campaign)
        )
    ).all()
    campaign_paying_map = {campaign: int(count) for campaign, count in campaign_paying_rows}
    campaign_performance = [
        CampaignPerformanceItem(
            campaign=campaign,
            signups=int(signups),
            paying=campaign_paying_map.get(campaign, 0),
            conversion_pct=round(campaign_paying_map.get(campaign, 0) / int(signups) * 100, 1) if signups else 0.0,
        )
        for campaign, signups in campaign_signup_rows
    ]

    return AttributionOut(
        updated_at=now,
        funnel_window_days=ATTRIBUTION_WINDOW_DAYS,
        funnel_by_channel=funnel_by_channel,
        cost_per_channel=cost_per_channel,
        cost_note=(
            "Cost per paying subscriber requires a connected ad-spend source (no marketing spend "
            "ledger exists in this system yet) — paying-subscriber counts per channel are shown, "
            "cost is left blank rather than fabricated."
        ),
        campaign_performance=campaign_performance,
    )


AI_COST_P95_ALERT_USD = 0.15


async def technical_metrics(db: AsyncSession) -> TechnicalOut:
    now = datetime.now(UTC)
    window_30d = now - timedelta(days=30)
    window_7d = now - timedelta(days=7)

    providers = (
        await db.execute(
            select(TokenUsage.provider).where(TokenUsage.created_at >= window_30d).distinct()
        )
    ).scalars().all()
    ai_cost_by_provider = []
    for provider in providers:
        p50, p95, mx = (
            await db.execute(
                select(
                    sa_func.percentile_cont(0.5).within_group(TokenUsage.estimated_cost_usd),
                    sa_func.percentile_cont(0.95).within_group(TokenUsage.estimated_cost_usd),
                    sa_func.max(TokenUsage.estimated_cost_usd),
                ).where(TokenUsage.provider == provider, TokenUsage.created_at >= window_30d)
            )
        ).one()
        p95_usd = round(float(p95 or 0), 4)
        ai_cost_by_provider.append(
            AiCostPercentile(
                provider=provider,
                p50_usd=round(float(p50 or 0), 4),
                p95_usd=p95_usd,
                max_usd=round(float(mx or 0), 4),
                p95_alert=p95_usd > AI_COST_P95_ALERT_USD,
            )
        )

    guardrail_rows = (
        await db.execute(
            select(SystemSecurityEvent.event_type, sa_func.count(SystemSecurityEvent.id))
            .where(SystemSecurityEvent.event_type == "book_size_exceeded", SystemSecurityEvent.created_at >= window_30d)
            .group_by(SystemSecurityEvent.event_type)
        )
    ).all()
    guardrail_events = [GuardrailEventItem(event_type=et, count_30d=int(c)) for et, c in guardrail_rows]

    ai_spend_by_tier_rows = (
        await db.execute(
            select(User.subscription_tier, sa_func.coalesce(sa_func.sum(TokenUsage.estimated_cost_usd), 0))
            .join(User, User.id == TokenUsage.user_id)
            .where(TokenUsage.created_at >= window_30d)
            .group_by(User.subscription_tier)
        )
    ).all()
    tier_buckets: dict[str, float] = {"free": 0.0, "paid": 0.0}
    for tier, spend in ai_spend_by_tier_rows:
        bucket = "free" if tier == "free" else "paid"
        tier_buckets[bucket] += float(spend)
    mrr_snapshot = await FinancialMetricsService(db).current_snapshot()
    ai_spend_vs_revenue = [
        AiSpendVsRevenuePoint(tier="free", ai_spend_usd=round(tier_buckets["free"], 2), revenue_usd=0.0),
        AiSpendVsRevenuePoint(tier="paid", ai_spend_usd=round(tier_buckets["paid"], 2), revenue_usd=mrr_snapshot.mrr),
    ]

    book_status_rows = (await db.execute(select(Book.status, sa_func.count(Book.id)).group_by(Book.status))).all()
    total_books = sum(int(c) for _, c in book_status_rows)
    conversion_success = [
        ConversionSuccessRate(
            status=s.value,
            count=int(c),
            pct_of_total=round(int(c) / total_books * 100, 1) if total_books else 0.0,
        )
        for s, c in book_status_rows
    ]

    proc_seconds = sa_func.extract("epoch", Book.processing_completed_at - Book.created_at)
    p50_sec, p95_sec, sample_size = (
        await db.execute(
            select(
                sa_func.percentile_cont(0.5).within_group(proc_seconds),
                sa_func.percentile_cont(0.95).within_group(proc_seconds),
                sa_func.count(Book.id),
            ).where(Book.processing_completed_at.is_not(None))
        )
    ).one()
    processing_time = ProcessingTimeStats(
        p50_seconds=round(float(p50_sec or 0), 1),
        p95_seconds=round(float(p95_sec or 0), 1),
        sample_size=int(sample_size or 0),
    )

    total_calls_7d = int(await db.scalar(select(sa_func.count(TokenUsage.id)).where(TokenUsage.created_at >= window_7d)) or 0)
    failed_calls_7d = int(
        await db.scalar(
            select(sa_func.count(TokenUsage.id)).where(TokenUsage.created_at >= window_7d, TokenUsage.status == "failed")
        )
        or 0
    )
    queue_depth = int(await db.scalar(select(sa_func.count(Book.id)).where(Book.status == BookStatus.processing)) or 0)
    operational_health = OperationalHealth(
        error_rate_pct=round(failed_calls_7d / total_calls_7d * 100, 2) if total_calls_7d else 0.0,
        queue_depth=queue_depth,
        uptime_note="Uptime is not instrumented — no APM/synthetic-monitoring is connected to this system yet.",
    )

    has_version_data = bool(
        await db.scalar(select(NativeRefreshSession.id).where(NativeRefreshSession.app_version.is_not(None)).limit(1))
    )
    crash_free_sessions_note = (
        "app_version is captured on native sessions but no client has reported one yet — crash-free "
        "rate can't be computed until the mobile app sends a version string."
        if not has_version_data
        else "app_version data is present, but crash reporting isn't wired in yet."
    )

    security_rows = (
        await db.execute(
            select(SystemSecurityEvent.event_type, sa_func.count(SystemSecurityEvent.id))
            .where(SystemSecurityEvent.created_at >= window_7d)
            .group_by(SystemSecurityEvent.event_type)
        )
    ).all()
    security_events = [SecurityEventCount(event_type=et, count_7d=int(c)) for et, c in security_rows]

    revoked_7d = int(
        await db.scalar(
            select(sa_func.count(NativeRefreshSession.id)).where(NativeRefreshSession.revoked_at >= window_7d)
        )
        or 0
    )
    active_sessions = int(
        await db.scalar(
            select(sa_func.count(NativeRefreshSession.id)).where(
                NativeRefreshSession.revoked_at.is_(None), NativeRefreshSession.expires_at > now
            )
        )
        or 0
    )
    revoked_sessions = RevokedSessionStats(revoked_7d=revoked_7d, active_sessions=active_sessions)

    dup_ip_rows = (
        await db.execute(
            select(User.last_ip, sa_func.count(User.id))
            .where(User.last_ip.is_not(None))
            .group_by(User.last_ip)
            .having(sa_func.count(User.id) >= 2)
            .order_by(sa_func.count(User.id).desc())
            .limit(20)
        )
    ).all()
    duplicate_ip_signals = [DuplicateIpSignal(ip_address=ip, account_count=int(c)) for ip, c in dup_ip_rows]

    infra_spend = InfraSpendOut(
        infra_spend_usd=0.0,
        revenue_usd=mrr_snapshot.mrr,
        note=(
            "No Supabase/S3/Redis/Resend billing API is connected yet, so this is intentionally 0 — "
            "not derived from AI cost. (The Cash module's 'infrastructure reserve' figure explicitly "
            "uses AI cost as a documented stand-in estimate for planning purposes; this figure does not, "
            "so it doesn't inherit that mislabeling.)"
        ),
    )

    return TechnicalOut(
        updated_at=now,
        ai_cost_by_provider=ai_cost_by_provider,
        ai_cost_alert_threshold_usd=AI_COST_P95_ALERT_USD,
        guardrail_events=guardrail_events,
        ai_spend_vs_revenue=ai_spend_vs_revenue,
        conversion_success=conversion_success,
        processing_time=processing_time,
        operational_health=operational_health,
        crash_free_sessions_note=crash_free_sessions_note,
        security_events=security_events,
        revoked_sessions=revoked_sessions,
        duplicate_ip_signals=duplicate_ip_signals,
        infra_spend=infra_spend,
    )


CHARGEBACK_ALERT_THRESHOLD_PCT = 0.75


async def compliance_metrics(db: AsyncSession) -> ComplianceOut:
    now = datetime.now(UTC)
    window_30d = now - timedelta(days=30)

    flagged_books = (await db.execute(select(Book.id, Book.title).where(Book.is_flagged.is_(True)))).all()
    content_flags_total = len(flagged_books)
    flags_page = flagged_books[:50]
    book_id_strs = [str(bid) for bid, _ in flags_page]
    audit_by_book: dict[str, tuple] = {}
    if book_id_strs:
        audit_rows = (
            await db.execute(
                select(
                    AdminAuditLog.target_resource_id,
                    AdminAuditLog.admin_email,
                    AdminAuditLog.reason,
                    AdminAuditLog.created_at,
                )
                .where(
                    AdminAuditLog.action == "content.flag",
                    AdminAuditLog.target_resource_type == "book",
                    AdminAuditLog.target_resource_id.in_(book_id_strs),
                )
                .order_by(AdminAuditLog.created_at.desc())
            )
        ).all()
        for resource_id, admin_email, reason, created_at in audit_rows:
            audit_by_book.setdefault(resource_id, (admin_email, reason, created_at))
    content_flags = [
        ContentFlagItem(
            book_id=str(bid),
            book_title=title,
            flagged_by_admin=audit_by_book.get(str(bid), (None, None, None))[0],
            reason=audit_by_book.get(str(bid), (None, None, None))[1],
            flagged_at=audit_by_book.get(str(bid), (None, None, None))[2],
        )
        for bid, title in flags_page
    ]

    dmca_rows = (
        await db.execute(
            select(DmcaNotice, Book.title)
            .outerjoin(Book, Book.id == DmcaNotice.book_id)
            .order_by(DmcaNotice.received_at.desc())
            .limit(100)
        )
    ).all()
    target_user_ids = [notice.target_user_id for notice, _ in dmca_rows if notice.target_user_id is not None]
    strike_counts: dict = {}
    if target_user_ids:
        strike_rows = (
            await db.execute(
                select(DmcaNotice.target_user_id, sa_func.count(DmcaNotice.id))
                .where(DmcaNotice.target_user_id.in_(target_user_ids), DmcaNotice.status == "content_removed")
                .group_by(DmcaNotice.target_user_id)
            )
        ).all()
        strike_counts = {uid: int(c) for uid, c in strike_rows}
    dmca_queue = [
        DmcaNoticeItem(
            id=str(notice.id),
            book_title=title,
            claimant_name=notice.claimant_name,
            status=notice.status,
            received_at=notice.received_at,
            statutory_response_deadline=notice.statutory_response_deadline,
            days_remaining=(notice.statutory_response_deadline - now).days,
            counter_notice_filed=notice.counter_notice_filed_at is not None,
            target_user_strike_count=strike_counts.get(notice.target_user_id, 0),
        )
        for notice, title in dmca_rows
    ]

    privacy_rows = (
        await db.execute(select(PrivacyRequest).order_by(PrivacyRequest.received_at.desc()).limit(100))
    ).scalars().all()
    privacy_requests = [
        PrivacyRequestItem(
            id=str(r.id),
            requester_email=r.requester_email,
            request_type=r.request_type,
            status=r.status,
            received_at=r.received_at,
            sla_deadline=r.sla_deadline,
            days_remaining=(r.sla_deadline - now).days,
        )
        for r in privacy_rows
    ]

    underage_rows = (
        await db.execute(
            select(sa_func.date(SystemSecurityEvent.created_at), sa_func.count(SystemSecurityEvent.id))
            .where(SystemSecurityEvent.event_type == "underage_signup_blocked", SystemSecurityEvent.created_at >= window_30d)
            .group_by(sa_func.date(SystemSecurityEvent.created_at))
        )
    ).all()
    underage_map = {d.isoformat(): int(c) for d, c in underage_rows}
    underage_blocked_trend = []
    for i in range(30):
        day = (now - timedelta(days=29 - i)).date()
        underage_blocked_trend.append(UnderageBlockedPoint(date=day.isoformat(), count=underage_map.get(day.isoformat(), 0)))

    disputes_30d = int(
        await db.scalar(
            select(sa_func.count(BillingEvent.id)).where(
                BillingEvent.event_type.like("charge.dispute%"), BillingEvent.received_at >= window_30d
            )
        )
        or 0
    )
    paid_invoices_30d = int(
        await db.scalar(
            select(sa_func.count(BillingInvoice.id)).where(
                BillingInvoice.paid_at.is_not(None), BillingInvoice.paid_at >= window_30d
            )
        )
        or 0
    )
    chargeback_rate_pct = round(disputes_30d / paid_invoices_30d * 100, 2) if paid_invoices_30d else 0.0

    trial_reminder_rows = (
        await db.execute(
            select(EmailJob.created_at, EmailJob.status)
            .where(EmailJob.category == "trial_reminder")
            .order_by(EmailJob.created_at.desc())
            .limit(50)
        )
    ).all()
    trial_reminder_log = [TrialReminderLogItem(sent_at=c, status=s) for c, s in trial_reminder_rows]

    return ComplianceOut(
        updated_at=now,
        dmca_queue=dmca_queue,
        content_flags=content_flags,
        content_flags_total=content_flags_total,
        privacy_requests=privacy_requests,
        underage_blocked_trend=underage_blocked_trend,
        chargeback_rate_pct=chargeback_rate_pct,
        chargeback_alert=chargeback_rate_pct > CHARGEBACK_ALERT_THRESHOLD_PCT,
        trial_reminder_note=(
            "No 'trial_reminder' email category exists in this system yet — there's no "
            "trial-ending-soon reminder feature built. This query is ready for when one ships; "
            "until then it will always be empty."
        ),
        trial_reminder_log=trial_reminder_log,
    )


async def alerts_metrics(db: AsyncSession) -> AlertsOut:
    from services.alert_evaluator import ALERT_THRESHOLDS, _current_values, _is_breached

    now = datetime.now(UTC)
    values = await _current_values(db)
    thresholds = [
        AlertThresholdStatus(
            key=t.key,
            label=t.label,
            unit=t.unit,
            threshold=t.threshold,
            comparison=t.comparison,
            current_value=values.get(t.key, 0.0),
            breached=_is_breached(values.get(t.key, 0.0), t),
            placeholder=t.placeholder,
        )
        for t in ALERT_THRESHOLDS
    ]

    breach_rows = (
        await db.execute(select(AlertEvent).order_by(AlertEvent.triggered_at.desc()).limit(50))
    ).scalars().all()
    recent_breaches = [
        AlertBreachItem(
            id=str(e.id),
            metric_key=e.metric_key,
            severity=e.severity,
            value=e.value,
            threshold=e.threshold,
            message=e.message,
            triggered_at=e.triggered_at,
            resolved_at=e.resolved_at,
        )
        for e in breach_rows
    ]

    return AlertsOut(
        updated_at=now,
        slack_delivery_mode=settings.SLACK_ALERT_DELIVERY_MODE,
        thresholds=thresholds,
        recent_breaches=recent_breaches,
    )


async def governance_metrics(db: AsyncSession) -> GovernanceOut:
    now = datetime.now(UTC)
    window_30d = now - timedelta(days=30)

    total_entries = int(await db.scalar(select(sa_func.count(AdminAuditLog.id))) or 0)
    entries_30d = int(
        await db.scalar(select(sa_func.count(AdminAuditLog.id)).where(AdminAuditLog.created_at >= window_30d)) or 0
    )

    action_rows = (
        await db.execute(
            select(AdminAuditLog.action, sa_func.count(AdminAuditLog.id))
            .where(AdminAuditLog.created_at >= window_30d)
            .group_by(AdminAuditLog.action)
            .order_by(sa_func.count(AdminAuditLog.id).desc())
            .limit(10)
        )
    ).all()
    top_actions_30d = [AdminActionCount(action=a, count_30d=int(c)) for a, c in action_rows]

    admin_rows = (
        await db.execute(
            select(AdminAuditLog.admin_email, sa_func.count(AdminAuditLog.id))
            .where(AdminAuditLog.created_at >= window_30d)
            .group_by(AdminAuditLog.admin_email)
            .order_by(sa_func.count(AdminAuditLog.id).desc())
            .limit(10)
        )
    ).all()
    most_active_admins_30d = [ActiveAdminCount(admin_email=e, action_count_30d=int(c)) for e, c in admin_rows]

    role_rows = (
        await db.execute(
            select(User.admin_role, sa_func.count(User.id))
            .where(User.role == UserRole.admin)
            .group_by(User.admin_role)
        )
    ).all()
    admin_role_counts = [AdminRoleCount(admin_role=r or "unassigned", admin_count=int(c)) for r, c in role_rows]

    return GovernanceOut(
        updated_at=now,
        total_audit_log_entries=total_entries,
        entries_30d=entries_30d,
        top_actions_30d=top_actions_30d,
        most_active_admins_30d=most_active_admins_30d,
        admin_role_counts=admin_role_counts,
    )


async def export_audit_log_csv(db: AsyncSession, *, limit: int = 5000) -> str:
    rows = (
        await db.execute(select(AdminAuditLog).order_by(AdminAuditLog.created_at.desc()).limit(limit))
    ).scalars().all()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["created_at", "admin_email", "action", "resource_type", "resource_id", "affected_user_id", "reason"])
    for r in rows:
        writer.writerow(
            [
                r.created_at.isoformat(),
                r.admin_email,
                r.action,
                r.target_resource_type,
                r.target_resource_id or "",
                str(r.affected_user_id) if r.affected_user_id else "",
                r.reason or "",
            ]
        )
    return output.getvalue()
