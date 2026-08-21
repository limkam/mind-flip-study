"""Owner Console dashboard response schemas (Modules 1-9), read-only metrics capture."""

from datetime import datetime

from pydantic import BaseModel


class UpcomingRenewal(BaseModel):
    date: datetime | None
    customer: str
    plan: str
    amount_usd: float


class DunningStageBucket(BaseModel):
    stage: int
    subscriptions: int
    mrr_at_risk_usd: float


class MRRMovementPoint(BaseModel):
    month: str
    new_mrr_usd: float
    expansion_mrr_usd: float
    contraction_mrr_usd: float
    churned_mrr_usd: float
    net_mrr_usd: float


class PlanMixItem(BaseModel):
    plan_slug: str
    plan_name: str
    subscribers: int
    pct_of_total: float
    target_pct: float | None = None


class BillingIntervalMixItem(BaseModel):
    interval: str
    subscribers: int
    pct_of_total: float


class RevenueOut(BaseModel):
    updated_at: datetime
    mrr_usd: float
    arr_usd: float
    # Expansion/contraction only accumulate from when subscription_plan_change_events
    # started being logged — no backfill is possible, so early months in this series
    # will show 0 for those two even though real plan changes may have happened.
    mrr_movements: list[MRRMovementPoint]
    plan_mix: list[PlanMixItem]
    billing_interval_mix: list[BillingIntervalMixItem]
    extra_credit_revenue_usd: float
    extra_credit_pct_of_mrr: float
    extra_credit_alert: bool


class CashOut(BaseModel):
    updated_at: datetime
    cash_available: float
    deferred_revenue: float
    refund_dispute_reserve: float
    tax_reserve: float
    operating_liabilities: float
    payroll_reserve: float
    infrastructure_reserve: float
    minimum_cash_buffer: float
    estimated_spendable_cash: float
    cash_runway_months: float
    assumptions: list[str]
    upcoming_renewals: list[UpcomingRenewal]
    upcoming_renewals_total_usd: float
    dunning_pipeline: list[DunningStageBucket]


class PlanMarginItem(BaseModel):
    plan: str
    paying_users: int
    recognized_revenue_usd: float
    contribution_margin_usd: float
    margin_pct: float


class ChannelEconomicsItem(BaseModel):
    channel: str
    paying_users: int
    avg_ltv_usd: float
    cac_usd: float | None = None
    ltv_to_cac: float | None = None
    payback_months: float | None = None


class AssumedVsMeasuredItem(BaseModel):
    metric: str
    unit: str
    measured_value: float
    assumed_value: float | None = None


class UnitEconomicsOut(BaseModel):
    updated_at: datetime
    margin_target_pct: float
    plan_margins: list[PlanMarginItem]
    channel_economics: list[ChannelEconomicsItem]
    cac_note: str
    assumed_vs_measured: list[AssumedVsMeasuredItem]


class CancellationReasonItem(BaseModel):
    reason: str
    count: int


class DayTwoReviewByChannel(BaseModel):
    channel: str
    cohort_size: int
    completed_day2_review: int
    completion_pct: float


class CohortRetentionPoint(BaseModel):
    cohort_month: str
    cohort_size: int
    week: int
    retained_pct: float


class StreakBucket(BaseModel):
    bucket: str
    users: int


class RetentionOut(BaseModel):
    updated_at: datetime
    monthly_churn_rate_pct: float
    cancellation_reasons: list[CancellationReasonItem]
    day2_review_by_channel: list[DayTwoReviewByChannel]
    cohort_retention: list[CohortRetentionPoint]
    streak_distribution: list[StreakBucket]
    lapsed_user_backlog: int
    lapsed_to_renewed_60d_pct: float


class AttributionFunnelItem(BaseModel):
    channel: str
    signups: int
    activated: int
    paying: int
    activation_pct: float
    paying_pct: float


class ChannelCostItem(BaseModel):
    channel: str
    paying_subscribers: int
    cost_per_paying_subscriber_usd: float | None = None


class CampaignPerformanceItem(BaseModel):
    campaign: str
    signups: int
    paying: int
    conversion_pct: float


class AttributionOut(BaseModel):
    updated_at: datetime
    funnel_window_days: int
    funnel_by_channel: list[AttributionFunnelItem]
    cost_per_channel: list[ChannelCostItem]
    cost_note: str
    campaign_performance: list[CampaignPerformanceItem]


class AiCostPercentile(BaseModel):
    provider: str
    p50_usd: float
    p95_usd: float
    max_usd: float
    p95_alert: bool


class GuardrailEventItem(BaseModel):
    event_type: str
    count_30d: int


class AiSpendVsRevenuePoint(BaseModel):
    tier: str
    ai_spend_usd: float
    revenue_usd: float


class ConversionSuccessRate(BaseModel):
    status: str
    count: int
    pct_of_total: float


class ProcessingTimeStats(BaseModel):
    p50_seconds: float
    p95_seconds: float
    sample_size: int


class OperationalHealth(BaseModel):
    error_rate_pct: float
    queue_depth: int
    uptime_note: str


class SecurityEventCount(BaseModel):
    event_type: str
    count_7d: int


class RevokedSessionStats(BaseModel):
    revoked_7d: int
    active_sessions: int


class DuplicateIpSignal(BaseModel):
    ip_address: str
    account_count: int


class InfraSpendOut(BaseModel):
    infra_spend_usd: float
    revenue_usd: float
    note: str


class AdminActionCount(BaseModel):
    action: str
    count_30d: int


class ActiveAdminCount(BaseModel):
    admin_email: str
    action_count_30d: int


class AdminRoleCount(BaseModel):
    admin_role: str
    admin_count: int


class GovernanceOut(BaseModel):
    updated_at: datetime
    total_audit_log_entries: int
    entries_30d: int
    top_actions_30d: list[AdminActionCount]
    most_active_admins_30d: list[ActiveAdminCount]
    admin_role_counts: list[AdminRoleCount]


class AlertThresholdStatus(BaseModel):
    key: str
    label: str
    unit: str
    threshold: float
    comparison: str
    current_value: float
    breached: bool
    placeholder: bool


class AlertBreachItem(BaseModel):
    id: str
    metric_key: str
    severity: str
    value: float
    threshold: float
    message: str
    triggered_at: datetime
    resolved_at: datetime | None = None


class AlertsOut(BaseModel):
    updated_at: datetime
    slack_delivery_mode: str
    thresholds: list[AlertThresholdStatus]
    recent_breaches: list[AlertBreachItem]


class DmcaNoticeItem(BaseModel):
    id: str
    book_title: str | None = None
    claimant_name: str
    status: str
    received_at: datetime
    statutory_response_deadline: datetime
    days_remaining: int
    counter_notice_filed: bool
    target_user_strike_count: int


class ContentFlagItem(BaseModel):
    book_id: str
    book_title: str
    flagged_by_admin: str | None = None
    flagged_at: datetime | None = None
    reason: str | None = None


class PrivacyRequestItem(BaseModel):
    id: str
    requester_email: str
    request_type: str
    status: str
    received_at: datetime
    sla_deadline: datetime
    days_remaining: int


class UnderageBlockedPoint(BaseModel):
    date: str
    count: int


class TrialReminderLogItem(BaseModel):
    sent_at: datetime
    status: str


class ComplianceOut(BaseModel):
    updated_at: datetime
    dmca_queue: list[DmcaNoticeItem]
    content_flags: list[ContentFlagItem]
    content_flags_total: int
    privacy_requests: list[PrivacyRequestItem]
    underage_blocked_trend: list[UnderageBlockedPoint]
    chargeback_rate_pct: float
    chargeback_alert: bool
    trial_reminder_note: str
    trial_reminder_log: list[TrialReminderLogItem]


class TechnicalOut(BaseModel):
    updated_at: datetime
    ai_cost_by_provider: list[AiCostPercentile]
    ai_cost_alert_threshold_usd: float
    guardrail_events: list[GuardrailEventItem]
    ai_spend_vs_revenue: list[AiSpendVsRevenuePoint]
    conversion_success: list[ConversionSuccessRate]
    processing_time: ProcessingTimeStats
    operational_health: OperationalHealth
    crash_free_sessions_note: str
    security_events: list[SecurityEventCount]
    revoked_sessions: RevokedSessionStats
    duplicate_ip_signals: list[DuplicateIpSignal]
    infra_spend: InfraSpendOut
