from __future__ import annotations

from datetime import datetime

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
