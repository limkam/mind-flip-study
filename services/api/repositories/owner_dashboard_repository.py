"""Canonical, set-based queries for the owner dashboard."""

from datetime import datetime, timedelta
from uuid import UUID

from sqlalchemy import case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from models.billing_analytics import BillingEvent, BillingInvoice
from models.book import Book
from models.plan import Plan
from models.token_usage import TokenUsage
from models.user import User
from models.user_subscription import UserSubscription

ACTIVE_STATUSES = ("active", "trialing", "past_due")


class OwnerDashboardRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def subscriptions(self):
        return (
            await self.db.execute(
                select(UserSubscription, Plan, User)
                .join(Plan, Plan.id == UserSubscription.plan_id)
                .join(User, User.id == UserSubscription.user_id)
                .where(UserSubscription.status.in_(ACTIVE_STATUSES))
            )
        ).all()

    async def invoices(
        self,
        start: datetime | None = None,
        end: datetime | None = None,
        user_id: UUID | None = None,
    ):
        stmt = select(BillingInvoice).where(
            BillingInvoice.status.in_(("paid", "partially_refunded", "refunded"))
        )
        if start:
            stmt = stmt.where(BillingInvoice.paid_at >= start)
        if end:
            stmt = stmt.where(BillingInvoice.paid_at < end)
        if user_id:
            stmt = stmt.where(BillingInvoice.user_id == user_id)
        return list((await self.db.scalars(stmt)).all())

    async def ai_cost(
        self, start: datetime, end: datetime, user_id: UUID | None = None
    ) -> float:
        stmt = select(func.sum(TokenUsage.estimated_cost_usd)).where(
            TokenUsage.created_at >= start, TokenUsage.created_at < end
        )
        if user_id:
            stmt = stmt.where(TokenUsage.user_id == user_id)
        return float(await self.db.scalar(stmt) or 0)

    async def analytics(self, start: datetime, end: datetime) -> dict:
        """Return compact aggregate series; never load raw telemetry for charts."""
        ai_day = func.date_trunc("day", TokenUsage.created_at)
        ai_daily = (
            await self.db.execute(
                select(
                    ai_day.label("bucket"),
                    func.sum(TokenUsage.estimated_cost_usd).label("cost"),
                    func.count(TokenUsage.id).label("requests"),
                    func.avg(TokenUsage.input_tokens + TokenUsage.output_tokens).label(
                        "tokens"
                    ),
                    func.avg(TokenUsage.duration_ms).label("latency"),
                    func.sum(
                        case((TokenUsage.status != "succeeded", 1), else_=0)
                    ).label("failures"),
                    func.sum(
                        case((TokenUsage.cache_read_tokens > 0, 1), else_=0)
                    ).label("cache_hits"),
                )
                .where(TokenUsage.created_at >= start, TokenUsage.created_at < end)
                .group_by(ai_day)
                .order_by(ai_day)
            )
        ).all()

        async def grouped(column):
            return (
                await self.db.execute(
                    select(
                        func.coalesce(column, "Unknown").label("label"),
                        func.sum(TokenUsage.estimated_cost_usd).label("cost"),
                        func.count(TokenUsage.id).label("requests"),
                    )
                    .where(TokenUsage.created_at >= start, TokenUsage.created_at < end)
                    .group_by(column)
                    .order_by(func.sum(TokenUsage.estimated_cost_usd).desc())
                    .limit(20)
                )
            ).all()

        invoice_day = func.date_trunc("day", BillingInvoice.paid_at)
        revenue_daily = (
            await self.db.execute(
                select(
                    invoice_day.label("bucket"),
                    func.sum(
                        BillingInvoice.amount_paid_cents
                        - BillingInvoice.amount_refunded_cents
                    ).label("net"),
                )
                .where(
                    BillingInvoice.paid_at >= start,
                    BillingInvoice.paid_at < end,
                    BillingInvoice.status.in_(
                        ("paid", "partially_refunded", "refunded")
                    ),
                )
                .group_by(invoice_day)
                .order_by(invoice_day)
            )
        ).all()
        by_plan = (
            await self.db.execute(
                select(
                    func.coalesce(BillingInvoice.plan_slug, "Unknown").label("label"),
                    func.sum(
                        BillingInvoice.amount_paid_cents
                        - BillingInvoice.amount_refunded_cents
                    ).label("net"),
                )
                .where(
                    BillingInvoice.paid_at >= start,
                    BillingInvoice.paid_at < end,
                    BillingInvoice.status.in_(
                        ("paid", "partially_refunded", "refunded")
                    ),
                )
                .group_by(BillingInvoice.plan_slug)
                .order_by(func.sum(BillingInvoice.amount_paid_cents).desc())
            )
        ).all()
        by_country = (
            await self.db.execute(
                select(
                    func.coalesce(User.country, "Unknown").label("label"),
                    func.sum(
                        BillingInvoice.amount_paid_cents
                        - BillingInvoice.amount_refunded_cents
                    ).label("net"),
                )
                .join(User, User.id == BillingInvoice.user_id)
                .where(
                    BillingInvoice.paid_at >= start,
                    BillingInvoice.paid_at < end,
                    BillingInvoice.status.in_(
                        ("paid", "partially_refunded", "refunded")
                    ),
                )
                .group_by(User.country)
                .order_by(func.sum(BillingInvoice.amount_paid_cents).desc())
                .limit(15)
            )
        ).all()
        return {
            "ai_daily": ai_daily,
            "providers": await grouped(TokenUsage.provider),
            "models": await grouped(TokenUsage.model),
            "features": await grouped(TokenUsage.feature_type),
            "revenue_daily": revenue_daily,
            "plans": by_plan,
            "countries": by_country,
        }

    async def renewals(self, start: datetime, end: datetime):
        return (
            await self.db.execute(
                select(
                    UserSubscription.current_period_end,
                    User.full_name,
                    Plan.name,
                    UserSubscription.unit_amount_cents,
                )
                .join(User, User.id == UserSubscription.user_id)
                .join(Plan, Plan.id == UserSubscription.plan_id)
                .where(
                    UserSubscription.status.in_(ACTIVE_STATUSES),
                    UserSubscription.current_period_end >= start,
                    UserSubscription.current_period_end < end,
                )
                .order_by(UserSubscription.current_period_end)
                .limit(50)
            )
        ).all()

    async def freshness(self) -> dict:
        stripe = await self.db.scalar(select(func.max(BillingInvoice.updated_at)))
        events = await self.db.scalar(select(func.max(BillingEvent.processed_at)))
        ai = await self.db.scalar(select(func.max(TokenUsage.created_at)))
        return {
            "stripe_sync_time": max(filter(None, (stripe, events)), default=None),
            "ai_sync_time": ai,
        }

    async def unit_economics(
        self,
        *,
        start: datetime,
        end: datetime,
        search: str | None,
        status: str | None,
        segment: str | None,
        sort: str,
        direction: str,
        page: int,
        page_size: int,
    ):
        overlap_seconds = func.extract(
            "epoch",
            func.least(BillingInvoice.period_end, end)
            - func.greatest(BillingInvoice.period_start, start),
        )
        period_seconds = func.extract(
            "epoch", BillingInvoice.period_end - BillingInvoice.period_start
        )
        recognized = case(
            (
                period_seconds > 0,
                (
                    BillingInvoice.amount_paid_cents
                    - BillingInvoice.amount_refunded_cents
                )
                * overlap_seconds
                / period_seconds,
            ),
            else_=0,
        )
        revenue = (
            select(
                BillingInvoice.user_id.label("uid"),
                func.sum(recognized).label("revenue"),
                func.count(BillingInvoice.id).label("payments"),
            )
            .where(
                BillingInvoice.status.in_(("paid", "partially_refunded", "refunded")),
                BillingInvoice.period_start < end,
                BillingInvoice.period_end > start,
            )
            .group_by(BillingInvoice.user_id)
            .subquery()
        )
        ai = (
            select(
                TokenUsage.user_id.label("uid"),
                func.sum(TokenUsage.estimated_cost_usd).label("ai_cost"),
            )
            .where(TokenUsage.created_at >= start, TokenUsage.created_at < end)
            .group_by(TokenUsage.user_id)
            .subquery()
        )
        books = (
            select(Book.user_id.label("uid"), func.count(Book.id).label("documents"))
            .where(Book.created_at < end)
            .group_by(Book.user_id)
            .subquery()
        )
        margin = (
            func.coalesce(revenue.c.revenue, 0) / 100.0
            - func.coalesce(ai.c.ai_cost, 0)
            - (
                func.coalesce(revenue.c.revenue, 0) / 100.0 * 0.029
                + func.coalesce(revenue.c.payments, 0) * 0.30
            )
        )
        stmt = (
            select(
                User.id,
                User.full_name,
                User.email,
                User.last_active_at,
                Plan.name.label("plan"),
                UserSubscription.billing_interval,
                UserSubscription.status,
                func.coalesce(revenue.c.revenue, 0).label("revenue_cents"),
                func.coalesce(ai.c.ai_cost, 0).label("ai_cost"),
                func.coalesce(revenue.c.payments, 0).label("payments"),
                func.coalesce(books.c.documents, 0).label("documents"),
                margin.label("margin"),
            )
            .join(UserSubscription, UserSubscription.user_id == User.id)
            .join(Plan, Plan.id == UserSubscription.plan_id)
            .outerjoin(revenue, revenue.c.uid == User.id)
            .outerjoin(ai, ai.c.uid == User.id)
            .outerjoin(books, books.c.uid == User.id)
            .where(UserSubscription.status.in_(ACTIVE_STATUSES))
        )
        if search:
            term = f"%{search.strip()}%"
            stmt = stmt.where(
                or_(
                    User.full_name.ilike(term),
                    User.email.ilike(term),
                    Plan.name.ilike(term),
                )
            )
        if status:
            stmt = stmt.where(UserSubscription.status == status)
        if segment == "negative_margin":
            stmt = stmt.where(margin < 0)
        elif segment == "inactive":
            stmt = stmt.where(User.last_active_at < end - timedelta(days=30))
        elif segment == "high_ai":
            stmt = stmt.where(func.coalesce(ai.c.ai_cost, 0) > 10)
        elif segment == "high_revenue":
            stmt = stmt.where(func.coalesce(revenue.c.revenue, 0) >= 10000)
        elif segment == "high_profit":
            stmt = stmt.where(margin >= 50)
        elif segment == "enterprise":
            stmt = stmt.where(Plan.name.ilike("%enterprise%"))
        elif segment == "annual":
            stmt = stmt.where(UserSubscription.billing_interval == "year")
        elif segment == "monthly":
            stmt = stmt.where(UserSubscription.billing_interval == "month")
        count = await self.db.scalar(
            select(func.count()).select_from(stmt.order_by(None).subquery())
        )
        columns = {
            "user": User.full_name,
            "plan": Plan.name,
            "recognized_revenue": revenue.c.revenue,
            "ai_cost": ai.c.ai_cost,
            "contribution_margin": margin,
            "last_active": User.last_active_at,
        }
        order = columns.get(sort, margin)
        order = order.asc() if direction == "asc" else order.desc()
        rows = (
            await self.db.execute(
                stmt.order_by(order.nullslast())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        ).all()
        return rows, int(count or 0)

    async def user_detail(self, user_id: UUID, start: datetime, end: datetime):
        user = await self.db.scalar(select(User).where(User.id == user_id))
        subscription = (
            await self.db.execute(
                select(UserSubscription, Plan)
                .join(Plan)
                .where(UserSubscription.user_id == user_id)
                .order_by(UserSubscription.created_at.desc())
            )
        ).first()
        usage = (
            await self.db.scalars(
                select(TokenUsage)
                .where(TokenUsage.user_id == user_id)
                .order_by(TokenUsage.created_at.desc())
                .limit(100)
            )
        ).all()
        invoices = await self.invoices(user_id=user_id)
        return user, subscription, list(invoices), list(usage)

    async def operational_counts(self, since: datetime):
        failed_events = int(
            await self.db.scalar(
                select(func.count(BillingEvent.id)).where(
                    BillingEvent.status == "failed", BillingEvent.received_at >= since
                )
            )
            or 0
        )
        failed_payments = int(
            await self.db.scalar(
                select(func.count(BillingInvoice.id)).where(
                    BillingInvoice.status.in_(("open", "uncollectible")),
                    BillingInvoice.updated_at >= since,
                )
            )
            or 0
        )
        duplicates = int(
            await self.db.scalar(
                select(func.count()).select_from(
                    select(UserSubscription.user_id)
                    .where(UserSubscription.status.in_(ACTIVE_STATUSES))
                    .group_by(UserSubscription.user_id)
                    .having(func.count(UserSubscription.id) > 1)
                    .subquery()
                )
            )
            or 0
        )
        missing_ai = int(
            await self.db.scalar(
                select(func.count(TokenUsage.id)).where(
                    or_(TokenUsage.provider.is_(None), TokenUsage.model.is_(None)),
                    TokenUsage.created_at >= since,
                )
            )
            or 0
        )
        return failed_events, failed_payments, duplicates, missing_ai
