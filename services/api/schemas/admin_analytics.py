from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class MonthCountPoint(BaseModel):
    month: str
    count: int


class ContentCreatedMonth(BaseModel):
    month: str
    books: int
    flashcard_sets: int


class ActiveUserRow(BaseModel):
    username: str
    quizzes_taken: int
    avg_score_pct: float
    books_uploaded: int
    last_active: datetime | None


class PlatformStatsOut(BaseModel):
    updated_at: datetime
    total_users: int
    books_uploaded: int
    flashcard_sets: int
    quiz_sessions: int
    assignments: int
    avg_quiz_score_pct: float
    workbooks: int
    assignments_completed: int
    perfect_quiz_scores: int
    avg_cards_per_set: float
    content_created_monthly: list[ContentCreatedMonth]
    most_active_users: list[ActiveUserRow]


class DailyActivityPoint(BaseModel):
    date: str
    events: int
    unique_users: int


class FeatureUsagePoint(BaseModel):
    feature: str
    count: int


class AssignmentHealthOut(BaseModel):
    total_assignments: int
    processed: int
    pending: int
    completed_by_student: int
    books_uploaded: int
    quiz_sessions: int


class AppMonitoringOut(BaseModel):
    updated_at: datetime
    dau: int
    wau: int
    mau: int
    avg_quiz_score_pct: float
    daily_activity: list[DailyActivityPoint]
    feature_usage: list[FeatureUsagePoint]
    assignment_health: AssignmentHealthOut


class UserGrowthMonth(BaseModel):
    month: str
    new_users: int
    cumulative_users: int


class LabeledCount(BaseModel):
    label: str
    count: int


class LabeledAmount(BaseModel):
    label: str
    amount_usd: float


class RankedTopic(BaseModel):
    rank: int
    topic: str
    count: int


class DemographicsOut(BaseModel):
    updated_at: datetime
    total_users: int
    countries_distinct: int
    continents_distinct: int
    active_licenses: int
    user_growth_monthly: list[UserGrowthMonth]
    users_by_country: list[LabeledCount]
    users_by_continent: list[LabeledCount]
    users_by_occupation: list[LabeledCount]
    users_by_age_group: list[LabeledCount]
    plan_distribution: list[LabeledCount]
    users_by_role: list[LabeledCount]
    top_study_topics: list[RankedTopic]


class RevenueMonthPoint(BaseModel):
    month: str
    revenue_usd: float


class RevenueByCountryRow(BaseModel):
    country: str
    users: int
    monthly_revenue_usd: float
    pct_of_total: float


class FinancialAnalyticsOut(BaseModel):
    updated_at: datetime
    mrr_usd: float
    arr_usd: float
    paying_users: int
    avg_revenue_per_user_usd: float
    revenue_monthly: list[RevenueMonthPoint]
    revenue_by_plan: list[LabeledAmount]
    revenue_by_continent: list[LabeledAmount]
    revenue_by_country: list[RevenueByCountryRow]


class AiUsageByFeature(BaseModel):
    feature_type: str
    calls: int
    input_tokens: int
    output_tokens: int
    cached_tokens: int
    total_cost_usd: float
    avg_duration_ms: float


class AiUsageByUser(BaseModel):
    user_id: str
    email: str
    total_cost_usd: float
    total_calls: int
    input_tokens: int
    output_tokens: int
    cached_tokens: int
    avg_duration_ms: float = 0


class AiUsageByTask(BaseModel):
    task: str
    feature_type: str | None = None
    calls: int
    input_tokens: int
    output_tokens: int
    cached_tokens: int
    total_cost_usd: float
    avg_duration_ms: float


class AiUsageLogEntry(BaseModel):
    id: str
    created_at: datetime
    user_id: str
    email: str
    task: str
    feature_type: str | None = None
    model: str
    input_tokens: int
    output_tokens: int
    cached_tokens: int
    duration_ms: int | None = None
    estimated_cost_usd: float
    book_id: str | None = None
    book_title: str | None = None
    celery_task_id: str | None = None
    call_metadata: dict[str, Any] | None = None


class AiUsageLogsOut(BaseModel):
    total: int
    limit: int
    offset: int
    items: list[AiUsageLogEntry]


class GenerationJobDetailOut(BaseModel):
    job_id: str
    status: str | None = None
    phase: str | None = None
    qa_status: str | None = None
    qa_failure_reason: str | None = None
    qa_failure_validator: str | None = None
    qa_attempt: int | None = None
    qa_failures: list[dict[str, Any]] | None = None
    generation_metrics: list[dict[str, Any]] | None = None
    set_id: str | None = None
    card_count: int | None = None
    scenario_count: int | None = None
    percent_complete: int | None = None
    error: str | None = None


class AiUsageByBook(BaseModel):
    book_id: str
    book_title: str
    total_cost_usd: float
    total_calls: int
    input_tokens: int
    output_tokens: int


class AiUsageAnalyticsOut(BaseModel):
    updated_at: datetime
    total_cost_usd: float
    total_calls: int
    total_input_tokens: int
    total_output_tokens: int
    total_cached_tokens: int
    avg_duration_ms: float
    cache_hit_rate_pct: float
    by_feature: list[AiUsageByFeature]
    by_task: list[AiUsageByTask]
    by_user: list[AiUsageByUser]
    by_book: list[AiUsageByBook]
    most_expensive_operations: list[AiUsageByFeature]
