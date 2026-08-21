function lastNMonths(n) {
  const out = [];
  const d = new Date();
  d.setDate(1);
  for (let i = n - 1; i >= 0; i -= 1) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    const month = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`;
    out.push(month);
  }
  return out;
}

export function last30DaysActivity() {
  const today = new Date();
  return Array.from({ length: 30 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (29 - i));
    return { date: d.toISOString().slice(0, 10), events: 0, unique_users: 0 };
  });
}

export const EMPTY_PLATFORM_STATS = {
  total_users: 0,
  books_uploaded: 0,
  flashcard_sets: 0,
  quiz_sessions: 0,
  assignments: 0,
  avg_quiz_score_pct: 0,
  workbooks: 0,
  assignments_completed: 0,
  perfect_quiz_scores: 0,
  avg_cards_per_set: 0,
  content_created_monthly: lastNMonths(12).map((month) => ({
    month,
    books: 0,
    flashcard_sets: 0,
  })),
  most_active_users: [],
};

export const EMPTY_APP_MONITORING = {
  dau: 0,
  wau: 0,
  mau: 0,
  avg_quiz_score_pct: 0,
  daily_activity: last30DaysActivity(),
  feature_usage: [
    { feature: 'Quiz Sessions', count: 0 },
    { feature: 'Books Uploaded', count: 0 },
    { feature: 'Flashcard Sets Created', count: 0 },
    { feature: 'Assignments Submitted', count: 0 },
  ],
  assignment_health: {
    total_assignments: 0,
    processed: 0,
    pending: 0,
    completed_by_student: 0,
    books_uploaded: 0,
    quiz_sessions: 0,
  },
};

export const EMPTY_DEMOGRAPHICS = {
  total_users: 0,
  countries_distinct: 0,
  continents_distinct: 0,
  active_subscriptions: 0,
  user_growth_monthly: lastNMonths(12).map((month) => ({
    month,
    new_users: 0,
    cumulative_users: 0,
  })),
  users_by_country: [],
  users_by_continent: [],
  users_by_occupation: [],
  users_by_gender: [],
  users_by_age_group: [],
  plan_distribution: [],
  users_by_role: [],
  top_study_topics: [],
};

export const EMPTY_METRICS = {
  dau: 0,
  signups_30d: 0,
  total_books: 0,
  ai_generations_30d: 0,
  paying_users: 0,
  mrr_usd: 0,
  ai_cost_30d_usd: 0,
  onboarding_started_30d: 0,
  onboarding_completed_30d: 0,
  onboarding_rate_pct: 0,
  churned_users_mtd: 0,
  churn_rate_pct: 0,
  usage_by_feature: [],
  ai_cost_daily: Array.from({ length: 30 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (29 - i));
    return { date: d.toISOString().slice(0, 10), ai_cost_usd: 0, ai_calls: 0 };
  }),
};

export const EMPTY_REVENUE = {
  mrr_usd: 0,
  arr_usd: 0,
  mrr_movements: lastNMonths(6).map((month) => ({
    month,
    new_mrr_usd: 0,
    expansion_mrr_usd: 0,
    contraction_mrr_usd: 0,
    churned_mrr_usd: 0,
    net_mrr_usd: 0,
  })),
  plan_mix: [],
  billing_interval_mix: [],
  extra_credit_revenue_usd: 0,
  extra_credit_pct_of_mrr: 0,
  extra_credit_alert: false,
};

export const EMPTY_CASH = {
  cash_available: 0,
  deferred_revenue: 0,
  refund_dispute_reserve: 0,
  tax_reserve: 0,
  operating_liabilities: 0,
  payroll_reserve: 0,
  infrastructure_reserve: 0,
  minimum_cash_buffer: 0,
  estimated_spendable_cash: 0,
  cash_runway_months: 0,
  assumptions: [],
  upcoming_renewals: [],
  upcoming_renewals_total_usd: 0,
  dunning_pipeline: [],
};

export const EMPTY_UNIT_ECONOMICS = {
  margin_target_pct: 70,
  plan_margins: [],
  channel_economics: [],
  cac_note: '',
  assumed_vs_measured: [],
};

export const EMPTY_RETENTION = {
  monthly_churn_rate_pct: 0,
  cancellation_reasons: [],
  day2_review_by_channel: [],
  cohort_retention: [],
  streak_distribution: [],
  lapsed_user_backlog: 0,
  lapsed_to_renewed_60d_pct: 0,
};

export const EMPTY_ATTRIBUTION = {
  funnel_window_days: 90,
  funnel_by_channel: [],
  cost_per_channel: [],
  cost_note: '',
  campaign_performance: [],
};

export const EMPTY_TECHNICAL = {
  ai_cost_by_provider: [],
  ai_cost_alert_threshold_usd: 0.15,
  guardrail_events: [],
  ai_spend_vs_revenue: [],
  conversion_success: [],
  processing_time: { p50_seconds: 0, p95_seconds: 0, sample_size: 0 },
  operational_health: { error_rate_pct: 0, queue_depth: 0, uptime_note: '' },
  crash_free_sessions_note: '',
  security_events: [],
  revoked_sessions: { revoked_7d: 0, active_sessions: 0 },
  duplicate_ip_signals: [],
  infra_spend: { infra_spend_usd: 0, revenue_usd: 0, note: '' },
};

export const EMPTY_COMPLIANCE = {
  dmca_queue: [],
  content_flags: [],
  content_flags_total: 0,
  privacy_requests: [],
  underage_blocked_trend: [],
  chargeback_rate_pct: 0,
  chargeback_alert: false,
  trial_reminder_note: '',
  trial_reminder_log: [],
};

export const EMPTY_ALERTS = {
  slack_delivery_mode: 'disabled',
  thresholds: [],
  recent_breaches: [],
};

export const EMPTY_GOVERNANCE = {
  total_audit_log_entries: 0,
  entries_30d: 0,
  top_actions_30d: [],
  most_active_admins_30d: [],
  admin_role_counts: [],
};

export const EMPTY_FINANCIAL = {
  mrr_usd: 0,
  arr_usd: 0,
  paying_users: 0,
  active_subscriptions: 0,
  avg_revenue_per_user_usd: 0,
  revenue_growth_pct: 0,
  churn_rate_pct: 0,
  lifetime_value_usd: 0,
  new_customers: 0,
  subscription_conflicts: 0,
  revenue_monthly: lastNMonths(12).map((month) => ({ month, revenue_usd: 0 })),
  revenue_by_plan: [],
  revenue_by_continent: [],
  revenue_by_country: [],
};
