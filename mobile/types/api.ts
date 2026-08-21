/** Shared list envelope from FastAPI (books, quiz-results, leaderboard). */
export type Paginated<T> = {
  items: T[];
  page: number;
  size: number;
  total: number;
  has_more: boolean;
  total_pages?: number;
};

export type EngagementPreferencesOut = {
  in_app_enabled: boolean;
  learning_reminders: boolean;
  streak_reminders: boolean;
  weekly_summaries: boolean;
  achievement_announcements: boolean;
  marketing_emails: boolean;
  celebration_animations: boolean;
  achievement_sounds: boolean;
  streak_sounds: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  timezone: string;
};

export type EngagementPreferencesPatch = Partial<EngagementPreferencesOut>;

export type NotificationOut = {
  id: string;
  user_id: string;
  category: string;
  type: string;
  title: string;
  body: string;
  action_url: string | null;
  created_at: string;
  read_at: string | null;
  seen_at: string | null;
  expires_at: string | null;
};

export type NotificationPage = {
  items: NotificationOut[];
  page: number;
  size: number;
  total: number;
  has_more: boolean;
  next_before_created_at: string | null;
  next_before_id: string | null;
};

export type UnreadCount = {
  count: number;
};

export type NudgeOut = {
  id: string;
  nudge_key: string;
  placement: string;
  category: string;
  priority: number;
  title: string;
  body: string;
  action_label: string;
  action_url: string;
  expires_at: string | null;
};

export type NudgeActionRequest = {
  idempotency_key: string;
};

export type WeakTopicOut = {
  set_id: string;
  title: string;
  avg_score: number;
};

export type ScoreTrendDayOut = {
  day: string;
  label: string;
  avg_score: number | null;
  quiz_count: number;
};

export type RatingBreakdownOut = {
  easy: number;
  medium: number;
  hard: number;
};

export type AnalyticsSummaryOut = {
  quiz_count: number;
  avg_score: number;
  streak_days: number;
  total_study_time_seconds?: number;
  has_perfect_quiz?: boolean;
  weak_topics?: WeakTopicOut[];
  flashcard_sets_count?: number;
  cards_mastered_easy_band?: number;
  score_trend?: ScoreTrendDayOut[];
  rating_breakdown?: RatingBreakdownOut;
  cards_reviewed_today?: number;
};

export type QuizResultInput = {
  set_id: string;
  score: number;
  total_questions: number;
  time_taken_seconds: number;
  extras: Record<string, unknown> | null;
};

export type QuizResultExtras = Record<string, unknown> & {
  set_title?: string | null;
  book_title?: string | null;
  percentage?: number;
  answers?: Array<{
    question?: string;
    user_answer?: string;
    correct_answer?: string;
    is_correct?: boolean;
    explanation?: string;
    chapter?: string;
  }>;
  game_type?: string;
  mode?: string;
};

export type QuizResultOut = {
  id: string;
  user_id: string;
  set_id: string;
  score: number;
  total_questions: number;
  time_taken_seconds: number;
  completed_at: string;
  extras: QuizResultExtras;
  flashcard_set_id: string | null;
  percentage: number | null;
  player_email: string | null;
  player_name: string | null;
  set_title: string | null;
  book_title: string | null;
  celebration_events: CelebrationEventOut[];
};

export type LeaderboardItemOut = {
  rank: number;
  user_id: string;
  full_name: string;
  avatar_url: string | null;
  value: number;
  metric: string;
  xp: number;
};

export type LeaderboardMeOut = {
  rank: number | null;
  value: number;
  metric: string;
  metric_label: string;
  xp: number;
};

export type FolderOut = {
  id: string;
  name: string;
  parent_id: string | null;
  description: string | null;
  color: string;
  icon: string;
  book_ids: string[];
  flashcard_set_ids: string[];
  created_at: string;
};

export type ChallengeQuestionOut = {
  question: string;
  options: string[];
  correct_answer: string;
  chapter?: string | null;
  difficulty?: string | null;
  cognitive_level?: string | null;
};

export type ChallengeSessionOut = {
  challenge_id: string;
  set_title: string;
  questions: ChallengeQuestionOut[];
};

export type QuizChallengeOut = {
  id: string;
  flashcard_set_id: string;
  challenger_email: string;
  challenger_name?: string | null;
  opponent_email: string;
  opponent_name?: string | null;
  status: string;
  set_title?: string | null;
  book_title?: string | null;
  challenger_score?: number | null;
  challenger_percentage?: number | null;
  challenger_time_seconds?: number | null;
  opponent_score?: number | null;
  opponent_percentage?: number | null;
  opponent_time_seconds?: number | null;
  winner_email?: string | null;
};

export type BookOut = {
  id: string;
  title: string;
  author: string;
  status: string;
  file_size_bytes: number;
  book_code: string;
  created_at: string;
  subject?: string;
  tags?: unknown[];
  description?: string;
  table_of_contents?: {
    title?: string;
    chapter_number?: number;
    subtopics?: string[];
    start_offset?: number;
    end_offset?: number;
  }[];
  toc_text_length?: number;
  is_analyzing?: boolean;
  processing_phase?: string;
  toc_job_id?: string;
  toc_error?: string;
  toc_extraction_method?: string;
  toc_ai_error?: string;
  chapter_card_counts?: Record<string, number>;
  extras?: { processing?: { job_id?: string; phase?: string; error?: string } };
};

export type StudyGroupPrivacy = "public" | "private";

export type StudyGroupCreateInput = {
  name: string;
  description: string | null;
  privacy: StudyGroupPrivacy;
  weekly_card_goal: number;
  book_ids: string[];
};

export type StudyGroupOut = {
  id: string;
  name: string;
  description: string | null;
  code: string | null;
  privacy: StudyGroupPrivacy;
  weekly_card_goal: number;
  member_count: number;
  cards_this_week: number;
  progress_pct: number;
  activity_status: string;
  created_at: string | null;
  is_member?: boolean;
};

export type StudyGroupMaterialInput = {
  book_id: string;
};

export type StudyGroupMaterialOut = {
  id: string;
  book_id: string;
  title: string;
  author: string;
  added_by_name: string;
  added_at: string | null;
};

export type StudyGroupMemberOut = {
  user_id: string;
  full_name: string;
  cards_this_week: number;
  role: string;
};

export type StudyGroupDetailOut = StudyGroupOut & {
  is_member: true;
  members: StudyGroupMemberOut[];
  materials: StudyGroupMaterialOut[];
};

export type FlashcardOut = {
  id: string;
  set_id: string;
  front: string;
  back: string;
  created_at: string;
  difficulty?: string | null;
  chapter?: string | null;
  cognitive_level?: string | null;
};

export type DueFlashcardOut = FlashcardOut & {
  set_title: string;
  book_id?: string | null;
  book_title?: string | null;
  ease_factor: number | null;
  interval_days: number | null;
  next_review_date: string | null;
  repetitions: number | null;
};

export type StudyProgressInput = {
  card_id: string;
  quality: number;
};

export type CelebrationEventOut = {
  event_id: string;
  event_type: string;
  occurred_at: string;
  entity_id: string | null;
  title: string | null;
  message: string | null;
  metadata: Record<string, unknown>;
};

export type StudyProgressOut = {
  id: string;
  card_id: string;
  ease_factor: number;
  interval_days: number;
  repetitions: number;
  next_review_date: string | null;
  last_reviewed_at: string | null;
  times_correct: number;
  times_incorrect: number;
  celebration_events: CelebrationEventOut[];
};

export type ScenarioOut = {
  type?: string;
  title: string;
  context?: string;
  challenge?: string;
  question?: string;
  prompt?: string;
  model_answer?: string;
  explanation?: string;
  guidance?: string;
  chapter?: string;
};

export type ChapterSummaryOut = {
  chapter: string;
  summary: string;
  key_points?: string[];
};

export type FlashcardSetOut = {
  id: string;
  title: string;
  card_count: number;
  book_title: string | null;
  book_id: string | null;
  user_id: string;
  tags: string[];
  cards?: FlashcardOut[];
  summary?: string | null;
  scenarios?: ScenarioOut[];
  chapter_summaries?: ChapterSummaryOut[];
  generation_seed?: number | null;
  selected_chapters?: string[];
  last_studied_at?: string | null;
};

export type FlashcardSetUpdateInput = {
  title?: string;
  description?: string;
  tags?: string[];
};

export type JobEnqueueResponse = {
  job_id: string;
  set_id?: string | null;
  workbook_id?: string | null;
  reused?: boolean;
  message?: string | null;
};

export type JobStatusResponse = {
  status: "pending" | "started" | "complete" | "failed";
  phase?: string | null;
  result?: unknown;
  chapters_total?: number | null;
  chapters_done?: number | null;
  percent_complete?: number | null;
  current_chapter?: string | null;
};
export type BillingInterval = "monthly" | "annual";

export type BillingPlanSlug = "free" | "quick_72" | "standard_15" | "premium_30";

export type BillingPlanPrice = {
  monthly_price_cents: number | null;
  annual_price_cents: number | null;
  annual_savings_cents: number | null;
  stripe_price_id_monthly: string | null;
  stripe_price_id_annual: string | null;
  most_popular: boolean;
};

export type BillingPricingResponse = {
  default_interval: BillingInterval;
  plans: Record<string, BillingPlanPrice>;
};

export type SubscriptionCheckoutVerificationResponse = {
  checkout_kind: "subscription";
  session_id: string;
  checkout_status: "open" | "complete" | "expired";
  subscription_state: "active" | "processing" | "conflict" | "not_confirmed";
  purchase_state: null;
  plan_slug: BillingPlanSlug | null;
  interval: BillingInterval | null;
  credit_quantity: null;
  unit_price_cents: null;
  amount_paid_cents: null;
  currency: null;
};

export type CreditCheckoutVerificationResponse = {
  checkout_kind: "credit_purchase";
  session_id: string;
  checkout_status: "open" | "complete" | "expired";
  subscription_state: null;
  purchase_state: "processing" | "credited" | "not_confirmed";
  plan_slug: null;
  interval: null;
  credit_quantity: number | null;
  unit_price_cents: number | null;
  amount_paid_cents: number | null;
  currency: string | null;
};

export type CheckoutVerificationResponse =
  | SubscriptionCheckoutVerificationResponse
  | CreditCheckoutVerificationResponse;

export type SubscriptionCancelResponse = {
  canceled_at_period_end: boolean;
  current_period_end: string | null;
};

export type SubscriptionChangePreviewResponse = {
  is_upgrade: boolean;
  plan_slug: string;
  billing_interval: string;
  amount_due_today_cents: number;
  new_recurring_amount_cents: number;
  currency: string;
  effective: "immediately" | "next_period";
  next_billing_date: string | null;
  downgrade_notice: string | null;
};

export type SubscriptionChangeResponse = {
  is_upgrade: boolean;
  plan_slug: string;
  billing_interval: string;
  effective: "immediately" | "next_period";
  pending_change_effective_at: string | null;
};

export type CreditPackTier = {
  credits: number;
  price_cents: number;
  price_usd: number;
};

export type CreditPricing = {
  tiers: CreditPackTier[];
  currency: string;
};

export type CreditPricingResponse = {
  pricing: CreditPricing;
};

export type CreditBalance = {
  total: number;
  monthly: number;
  purchased: number;
  available_total: number;
  plan: { allocated: number; used: number; remaining: number };
  purchased_position: { purchased_total: number; used: number; remaining: number };
};

export type CreditBalanceResponse = {
  balance: CreditBalance;
};

export type CreditUsageRecord = {
  id: string;
  amount: number;
  pool: string;
  reason: string;
  metadata: Record<string, unknown> | null;
  expires_at: string | null;
  created_at: string;
};

export type CreditUsageResponse = {
  entries: CreditUsageRecord[];
  discarded_count: number;
  discarded_duplicates_count: number;
};

export type CreditPurchaseRecord = {
  id: string;
  quantity: number;
  amount_paid_cents: number;
  currency: string;
  unit_price_cents: number;
  created_at: string;
  status: string;
  receipt_url?: string | null;
};

export type PurchaseHistoryResponse = {
  purchases: CreditPurchaseRecord[];
  total_purchases: number;
  discarded_count: number;
  discarded_duplicates_count: number;
};

export type CreditActivityFilter =
  | "all"
  | "usage"
  | "allowances"
  | "purchases";

export type ScorecardPeriodType = "weekly" | "monthly" | "course";

export type ScorecardDataState = "empty" | "partial" | "complete";

export type ScorecardMetrics = {
  data_state?: ScorecardDataState;
  course_title?: string;
  assessments_completed?: number;
  cards_reviewed?: number;
  current_streak?: number;
  learning_minutes?: number;
  average_assessment_score?: number | null;
  personal_best?: boolean;
};

export type ScorecardOut = {
  id: string;
  period_type: ScorecardPeriodType;
  entity_id: string;
  period_start: string;
  period_end: string;
  score: number;
  formula_version: string;
  metrics: ScorecardMetrics;
};

export type ScorecardShareExpiryDays = 7 | 30 | 90;

export type ShareCreateIn = {
  expires_in_days: ScorecardShareExpiryDays;
  show_display_name: boolean;
  public_display_name: string | null;
  public_message?: string | null;
};

export type ShareOut = {
  id: string;
  share_url: string;
  expires_at: string;
  show_display_name: boolean;
};

export type ShareRevokeOut = {
  revoked: true;
};
