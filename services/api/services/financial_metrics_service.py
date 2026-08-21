"""Canonical subscription-normalized recurring revenue metrics."""

from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from models.user_subscription import UserSubscription

ELIGIBLE_SUBSCRIPTION_STATUSES = ("active",)


def calculate_mrr(amounts: list[tuple[int | None, str | None, int]]) -> float:
    """Normalize provider subscription-item amounts into monthly USD."""
    cents = 0.0
    for amount, interval, interval_count in amounts:
        if amount is None:
            continue
        count = max(1, interval_count or 1)
        divisor = count * 12 if interval in ("year", "annual") else count
        cents += amount / divisor
    return round(cents / 100, 2)


def calculate_arr(mrr: float) -> float:
    return round(mrr * 12, 2)


def calculate_arppu(mrr: float, paying_users: int) -> float:
    return round(mrr / paying_users, 2) if paying_users else 0.0


def calculate_mrr_change(current: float, previous: float | None) -> float | None:
    if previous is None or previous == 0:
        return None
    return round((current - previous) / abs(previous) * 100, 1)


@dataclass(frozen=True)
class FinancialSnapshot:
    mrr: float
    arr: float
    paying_users: int
    active_subscriptions: int
    arppu: float
    conflict_users: int

    @property
    def includes_conflicts(self) -> bool:
        return self.conflict_users > 0


class FinancialMetricsService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def current_snapshot(self) -> FinancialSnapshot:
        now = datetime.now(UTC)
        count = func.nullif(UserSubscription.interval_count, 0)
        monthly_cents = func.coalesce(
            func.sum(
                case(
                    (
                        UserSubscription.billing_interval.in_(("year", "annual")),
                        UserSubscription.unit_amount_cents / (count * 12),
                    ),
                    else_=UserSubscription.unit_amount_cents / count,
                )
            ),
            0,
        )
        eligible = (
            UserSubscription.status.in_(ELIGIBLE_SUBSCRIPTION_STATUSES),
            UserSubscription.current_period_end.is_not(None),
            UserSubscription.current_period_end > now,
        )
        conflicted_users = (
            select(UserSubscription.user_id)
            .where(*eligible)
            .group_by(UserSubscription.user_id)
            .having(func.count(UserSubscription.id) > 1)
        )
        row = (
            await self.db.execute(
                select(
                    monthly_cents.label("mrr_cents"),
                    func.count(func.distinct(UserSubscription.user_id)).label("users"),
                    func.count(UserSubscription.id).label("subscriptions"),
                ).where(*eligible, UserSubscription.user_id.not_in(conflicted_users))
            )
        ).one()
        conflicts = int(
            await self.db.scalar(
                select(func.count()).select_from(
                    conflicted_users
                    .subquery()
                )
            )
            or 0
        )
        mrr = round(float(row.mrr_cents or 0) / 100, 2)
        users = int(row.users or 0)
        return FinancialSnapshot(
            mrr=mrr,
            arr=calculate_arr(mrr),
            paying_users=users,
            active_subscriptions=int(row.subscriptions or 0),
            arppu=calculate_arppu(mrr, users),
            conflict_users=conflicts,
        )


@dataclass(frozen=True)
class ChurnSnapshot:
    churned_users: int
    starting_customers: int
    churn_rate_pct: float


async def calculate_monthly_churn(
    db: AsyncSession, *, period_start: datetime, now: datetime
) -> ChurnSnapshot:
    """The one canonical churn calculation — every dashboard must call this.

    Standard SaaS definition: (customers lost during the period) / (customers already
    subscribed as of the start of the period). Both counts come straight off
    ``UserSubscription.subscription_started_at``/``canceled_at``, which are mirrored
    verbatim from Stripe on every webhook sync (see ``_sync_subscription_from_stripe_object``
    in routers/billing.py), so no separate transition-history table is needed to answer
    this specific question. Voluntary and involuntary cancellations are combined — Stripe
    sets ``canceled_at`` identically for both once a subscription reaches its terminal
    ``canceled`` status.
    """
    starting_customers = int(
        await db.scalar(
            select(func.count(func.distinct(UserSubscription.user_id))).where(
                UserSubscription.subscription_started_at.is_not(None),
                UserSubscription.subscription_started_at <= period_start,
                or_(
                    UserSubscription.canceled_at.is_(None),
                    UserSubscription.canceled_at >= period_start,
                ),
            )
        )
        or 0
    )
    churned_users = int(
        await db.scalar(
            select(func.count(func.distinct(UserSubscription.user_id))).where(
                UserSubscription.canceled_at.is_not(None),
                UserSubscription.canceled_at >= period_start,
                UserSubscription.canceled_at <= now,
            )
        )
        or 0
    )
    churn_rate_pct = (
        round(churned_users / starting_customers * 100, 1) if starting_customers else 0.0
    )
    return ChurnSnapshot(
        churned_users=churned_users,
        starting_customers=starting_customers,
        churn_rate_pct=churn_rate_pct,
    )
