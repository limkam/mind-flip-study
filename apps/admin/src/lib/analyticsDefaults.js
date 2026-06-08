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
  active_licenses: 0,
  user_growth_monthly: lastNMonths(12).map((month) => ({
    month,
    new_users: 0,
    cumulative_users: 0,
  })),
  users_by_country: [],
  users_by_continent: [],
  users_by_occupation: [],
  users_by_age_group: [],
  plan_distribution: [],
  users_by_role: [],
  top_study_topics: [],
};

export const EMPTY_FINANCIAL = {
  mrr_usd: 0,
  arr_usd: 0,
  paying_users: 0,
  avg_revenue_per_user_usd: 0,
  revenue_monthly: lastNMonths(12).map((month) => ({ month, revenue_usd: 0 })),
  revenue_by_plan: [],
  revenue_by_continent: [],
  revenue_by_country: [],
};
