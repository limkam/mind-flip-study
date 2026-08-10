"""Canonical subscription-normalized recurring revenue metrics."""

from dataclasses import dataclass

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from models.user_subscription import UserSubscription

ELIGIBLE_SUBSCRIPTION_STATUSES = ("active", "trialing", "past_due")


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
        eligible = UserSubscription.status.in_(ELIGIBLE_SUBSCRIPTION_STATUSES)
        row = (
            await self.db.execute(
                select(
                    monthly_cents.label("mrr_cents"),
                    func.count(func.distinct(UserSubscription.user_id)).label("users"),
                    func.count(UserSubscription.id).label("subscriptions"),
                ).where(eligible)
            )
        ).one()
        conflicts = int(
            await self.db.scalar(
                select(func.count()).select_from(
                    select(UserSubscription.user_id)
                    .where(eligible)
                    .group_by(UserSubscription.user_id)
                    .having(func.count(UserSubscription.id) > 1)
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
