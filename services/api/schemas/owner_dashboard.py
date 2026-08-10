from datetime import datetime
from typing import Any
from uuid import UUID
from pydantic import BaseModel, Field


class Freshness(BaseModel):
    last_updated: datetime
    stripe_sync_time: datetime | None = None
    ai_sync_time: datetime | None = None
    database_snapshot_time: datetime
    stale: bool = False


class Metric(BaseModel):
    key: str
    label: str
    value: float | None
    format: str = "currency"
    unit: str = "USD"
    status: str = "measured"
    definition: str = ""
    confidence: str = "high"
    as_of: datetime
    reason: str | None = None
    includes_conflicts: bool = False
    warning: str | None = None
    previous_value: float | None = None
    change_pct: float | None = None
    trend: str = "unavailable"
    tooltip: str


class SummaryOut(BaseModel):
    metrics: list[Metric]
    cash_collected: float
    freshness: Freshness


class CashPositionOut(BaseModel):
    cash_available: float
    deferred_revenue: float
    refund_dispute_reserve: float
    tax_reserve: float
    operating_liabilities: float
    payroll_reserve: float = 0
    infrastructure_reserve: float = 0
    minimum_cash_buffer: float
    estimated_spendable_cash: float
    cash_runway_months: float = 0
    assumptions: list[str]
    freshness: Freshness


class UnitEconomicsRow(BaseModel):
    user_id: UUID
    user: str
    email: str
    plan: str
    billing_interval: str | None
    recognized_revenue: float
    ai_cost: float
    payment_processing_cost: float
    storage_cost: float = 0
    email_cost: float = 0
    infrastructure_cost: float = 0
    total_variable_cost: float = 0
    contribution_margin: float
    margin_pct: float
    documents: int
    chapters: int = 0
    last_active: datetime | None
    status: str
    lifetime_value: float = 0
    customer_health_score: int = 0
    flags: list[str] = Field(default_factory=list)


class UnitEconomicsOut(BaseModel):
    items: list[UnitEconomicsRow]
    total: int
    page: int
    page_size: int
    freshness: Freshness


class UserDetailOut(BaseModel):
    profile: dict[str, Any]
    subscription: dict[str, Any] | None
    payment_history: list[dict[str, Any]]
    recognized_revenue: float
    ai_cost_by_provider: list[dict[str, Any]]
    ai_cost_by_model: list[dict[str, Any]]
    ai_cost_by_feature: list[dict[str, Any]]
    token_usage: dict[str, int]
    average_cost_per_document: float
    average_cost_per_chapter: float
    margin_trend: list[dict[str, Any]]
    failed_payments: int
    refunds: float
    subscription_conflicts: bool
    recent_ai_activity: list[dict[str, Any]]
    recent_uploads: list[dict[str, Any]]
    recent_generations: list[dict[str, Any]]


class Alert(BaseModel):
    id: str
    severity: str
    title: str
    description: str
    first_detected: datetime
    last_detected: datetime
    action_url: str
    acknowledged: bool = False


class AlertsOut(BaseModel):
    items: list[Alert]
    freshness: Freshness


class SystemHealthOut(BaseModel):
    status: str
    stripe_sync: str
    ai_telemetry: str
    database: str
    alerts: int
    indicators: list[dict[str, Any]] = Field(default_factory=list)
    freshness: Freshness


class DashboardPayload(BaseModel):
    model_config = {"extra": "allow"}
