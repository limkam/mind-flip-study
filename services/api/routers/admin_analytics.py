"""Admin analytics dashboards — server-side SQL aggregations only."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta, time
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import Date, cast, func, literal, select, union_all
from sqlalchemy.ext.asyncio import AsyncSession

from age_utils import AGE_GROUP_LABELS, age_group_from_dob
from database import get_db
from dependencies import require_role
from models.assignment import Assignment
from models.book import Book
from models.enums import AssignmentStatus
from models.flashcard import Flashcard, FlashcardSet, Workbook
from models.license import License
from models.quiz import QuizResult, StudyEvent
from models.token_usage import TokenUsage
from models.user import User
from schemas.admin_analytics import (
    ActiveUserRow,
    AiUsageAnalyticsOut,
    AiUsageByBook,
    AiUsageByFeature,
    AiUsageByTask,
    AiUsageByUser,
    AiUsageLogEntry,
    AiUsageLogsOut,
    AppMonitoringOut,
    AssignmentHealthOut,
    ContentCreatedMonth,
    DailyActivityPoint,
    DemographicsOut,
    FeatureUsagePoint,
    FinancialAnalyticsOut,
    GenerationJobDetailOut,
    LabeledAmount,
    LabeledCount,
    PlatformStatsOut,
    RankedTopic,
    RevenueByCountryRow,
    RevenueMonthPoint,
    UserGrowthMonth,
)
from job_cache import get_cached_job

router = APIRouter(tags=["admin-analytics"])

_ACTIVE_LICENSE_STATUSES = ("active", "paid")


def _quiz_pct_expr():
    return 100.0 * QuizResult.score / func.nullif(QuizResult.total_questions, 0)


def _month_bucket(col):
    """Truncated month for GROUP BY / ORDER BY (PostgreSQL-safe)."""
    return func.date_trunc("month", col)


def _month_label(bucket):
    """Format a month bucket (from ``_month_bucket``) as YYYY-MM."""
    return func.to_char(bucket, "YYYY-MM")


def _geo_label(col):
    return func.coalesce(
        func.nullif(func.trim(col), ""),
        literal("Unknown"),
    )


def _license_monthly_rev():
    return License.price / func.nullif(License.billing_period_months, 0)


def _active_license_clause():
    return License.status.in_(_ACTIVE_LICENSE_STATUSES)


async def _avg_quiz_score_pct(db: AsyncSession) -> float:
    raw = await db.scalar(select(func.avg(_quiz_pct_expr())))
    return round(float(raw or 0), 1)


@router.get("/platform-stats", response_model=PlatformStatsOut)
async def platform_stats(
    _admin: Annotated[User, Depends(require_role("admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PlatformStatsOut:
    now = datetime.now(UTC)
    twelve_months_ago = datetime.combine(
        (date.today().replace(day=1) - timedelta(days=365)),
        time.min,
        tzinfo=UTC,
    )

    total_users = int(await db.scalar(select(func.count(User.id))) or 0)
    books_uploaded = int(await db.scalar(select(func.count(Book.id))) or 0)
    flashcard_sets = int(await db.scalar(select(func.count(FlashcardSet.id))) or 0)
    quiz_sessions = int(await db.scalar(select(func.count(QuizResult.id))) or 0)
    assignments = int(await db.scalar(select(func.count(Assignment.id))) or 0)
    workbooks = int(await db.scalar(select(func.count(Workbook.id))) or 0)
    assignments_completed = int(
        await db.scalar(
            select(func.count(Assignment.id)).where(
                Assignment.status == AssignmentStatus.completed,
            ),
        )
        or 0,
    )
    perfect_quiz_scores = int(
        await db.scalar(
            select(func.count(QuizResult.id)).where(
                QuizResult.score == QuizResult.total_questions,
                QuizResult.total_questions > 0,
            ),
        )
        or 0,
    )
    cards_per_set = (
        select(func.count(Flashcard.id).label("cnt"))
        .group_by(Flashcard.set_id)
        .subquery()
    )
    avg_cards_raw = await db.scalar(select(func.avg(cards_per_set.c.cnt)))
    avg_cards_per_set = round(float(avg_cards_raw or 0), 1)

    book_month = _month_bucket(Book.created_at)
    books_monthly = await db.execute(
        select(_month_label(book_month).label("month"), func.count().label("n"))
        .where(Book.created_at >= twelve_months_ago)
        .group_by(book_month)
        .order_by(book_month),
    )
    set_month = _month_bucket(FlashcardSet.created_at)
    sets_monthly = await db.execute(
        select(_month_label(set_month).label("month"), func.count().label("n"))
        .where(FlashcardSet.created_at >= twelve_months_ago)
        .group_by(set_month)
        .order_by(set_month),
    )
    books_map = {row.month: int(row.n) for row in books_monthly.all()}
    sets_map = {row.month: int(row.n) for row in sets_monthly.all()}
    all_months = sorted(set(books_map) | set(sets_map))
    content_created_monthly = [
        ContentCreatedMonth(
            month=m,
            books=books_map.get(m, 0),
            flashcard_sets=sets_map.get(m, 0),
        )
        for m in all_months
    ]

    quiz_stats = (
        select(
            QuizResult.user_id.label("uid"),
            func.count(QuizResult.id).label("quizzes"),
            func.avg(_quiz_pct_expr()).label("avg_score"),
        )
        .group_by(QuizResult.user_id)
        .subquery()
    )
    book_stats = (
        select(Book.user_id.label("uid"), func.count(Book.id).label("books"))
        .group_by(Book.user_id)
        .subquery()
    )

    active_rows = await db.execute(
        select(
            User.full_name,
            quiz_stats.c.quizzes,
            quiz_stats.c.avg_score,
            func.coalesce(book_stats.c.books, 0).label("books"),
            User.last_active_at,
        )
        .join(quiz_stats, quiz_stats.c.uid == User.id)
        .outerjoin(book_stats, book_stats.c.uid == User.id)
        .order_by(quiz_stats.c.quizzes.desc())
        .limit(20),
    )
    most_active_users = [
        ActiveUserRow(
            username=row.full_name,
            quizzes_taken=int(row.quizzes or 0),
            avg_score_pct=round(float(row.avg_score or 0), 1),
            books_uploaded=int(row.books or 0),
            last_active=row.last_active_at,
        )
        for row in active_rows.all()
    ]

    return PlatformStatsOut(
        updated_at=now,
        total_users=total_users,
        books_uploaded=books_uploaded,
        flashcard_sets=flashcard_sets,
        quiz_sessions=quiz_sessions,
        assignments=assignments,
        avg_quiz_score_pct=await _avg_quiz_score_pct(db),
        workbooks=workbooks,
        assignments_completed=assignments_completed,
        perfect_quiz_scores=perfect_quiz_scores,
        avg_cards_per_set=avg_cards_per_set,
        content_created_monthly=content_created_monthly,
        most_active_users=most_active_users,
    )


@router.get("/app-monitoring", response_model=AppMonitoringOut)
async def app_monitoring(
    _admin: Annotated[User, Depends(require_role("admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AppMonitoringOut:
    now = datetime.now(UTC)
    today = date.today()
    day_start = datetime.combine(today, time.min, tzinfo=UTC)
    day_end = day_start + timedelta(days=1)
    week_start = day_start - timedelta(days=7)
    month_start = day_start - timedelta(days=30)
    chart_start = day_start - timedelta(days=30)

    def _distinct_users(since: datetime, until: datetime | None = None):
        stmt = select(func.count(func.distinct(StudyEvent.user_id))).where(
            StudyEvent.created_at >= since,
        )
        if until is not None:
            stmt = stmt.where(StudyEvent.created_at < until)
        return stmt

    dau = int(await db.scalar(_distinct_users(day_start, day_end)) or 0)
    wau = int(await db.scalar(_distinct_users(week_start)) or 0)
    mau = int(await db.scalar(_distinct_users(month_start)) or 0)

    daily_rows = await db.execute(
        select(
            cast(StudyEvent.created_at, Date).label("day"),
            func.count(StudyEvent.id).label("events"),
            func.count(func.distinct(StudyEvent.user_id)).label("users"),
        )
        .where(StudyEvent.created_at >= chart_start)
        .group_by(cast(StudyEvent.created_at, Date))
        .order_by(cast(StudyEvent.created_at, Date)),
    )
    daily_map = {
        row.day.isoformat(): (int(row.events or 0), int(row.users or 0))
        for row in daily_rows.all()
    }
    daily_activity: list[DailyActivityPoint] = []
    for i in range(30):
        d = today - timedelta(days=29 - i)
        key = d.isoformat()
        events, users = daily_map.get(key, (0, 0))
        daily_activity.append(
            DailyActivityPoint(date=key, events=events, unique_users=users),
        )

    books_n = int(await db.scalar(select(func.count(Book.id))) or 0)
    sets_n = int(await db.scalar(select(func.count(FlashcardSet.id))) or 0)
    quizzes_n = int(await db.scalar(select(func.count(QuizResult.id))) or 0)
    assignments_n = int(await db.scalar(select(func.count(Assignment.id))) or 0)

    feature_usage = [
        FeatureUsagePoint(feature="Quiz Sessions", count=quizzes_n),
        FeatureUsagePoint(feature="Books Uploaded", count=books_n),
        FeatureUsagePoint(feature="Flashcard Sets Created", count=sets_n),
        FeatureUsagePoint(feature="Assignments Submitted", count=assignments_n),
    ]

    processed = int(
        await db.scalar(
            select(func.count(Assignment.id)).where(
                Assignment.status == AssignmentStatus.processed,
            ),
        )
        or 0,
    )
    pending = int(
        await db.scalar(
            select(func.count(Assignment.id)).where(
                Assignment.status == AssignmentStatus.pending,
            ),
        )
        or 0,
    )
    completed = int(
        await db.scalar(
            select(func.count(Assignment.id)).where(
                Assignment.status == AssignmentStatus.completed,
            ),
        )
        or 0,
    )

    return AppMonitoringOut(
        updated_at=now,
        dau=dau,
        wau=wau,
        mau=mau,
        avg_quiz_score_pct=await _avg_quiz_score_pct(db),
        daily_activity=daily_activity,
        feature_usage=feature_usage,
        assignment_health=AssignmentHealthOut(
            total_assignments=assignments_n,
            processed=processed,
            pending=pending,
            completed_by_student=completed,
            books_uploaded=books_n,
            quiz_sessions=quizzes_n,
        ),
    )


@router.get("/demographics", response_model=DemographicsOut)
async def demographics(
    _admin: Annotated[User, Depends(require_role("admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> DemographicsOut:
    now = datetime.now(UTC)
    twelve_months_ago = datetime.combine(
        (date.today().replace(day=1) - timedelta(days=365)),
        time.min,
        tzinfo=UTC,
    )

    total_users = int(await db.scalar(select(func.count(User.id))) or 0)
    countries_distinct = int(
        await db.scalar(select(func.count(func.distinct(_geo_label(User.country)))))
        or 0,
    )
    continents_distinct = int(
        await db.scalar(select(func.count(func.distinct(_geo_label(User.continent)))))
        or 0,
    )
    active_licenses = int(
        await db.scalar(
            select(func.count(License.id)).where(_active_license_clause()),
        )
        or 0,
    )

    user_month = _month_bucket(User.created_at)
    growth_rows = await db.execute(
        select(_month_label(user_month).label("month"), func.count().label("new_users"))
        .where(User.created_at >= twelve_months_ago)
        .group_by(user_month)
        .order_by(user_month),
    )
    growth_list = growth_rows.all()
    cumulative = 0
    # Users created before the window
    before_window = int(
        await db.scalar(
            select(func.count(User.id)).where(User.created_at < twelve_months_ago),
        )
        or 0,
    )
    cumulative = before_window
    user_growth_monthly: list[UserGrowthMonth] = []
    for row in growth_list:
        cumulative += int(row.new_users)
        user_growth_monthly.append(
            UserGrowthMonth(
                month=row.month,
                new_users=int(row.new_users),
                cumulative_users=cumulative,
            ),
        )

    country_label = _geo_label(User.country)
    country_rows = await db.execute(
        select(country_label.label("label"), func.count().label("n"))
        .group_by(country_label)
        .order_by(func.count().desc())
        .limit(12),
    )
    continent_label = _geo_label(User.continent)
    continent_rows = await db.execute(
        select(continent_label.label("label"), func.count().label("n"))
        .group_by(continent_label)
        .order_by(func.count().desc()),
    )
    occupation_label = func.coalesce(
        func.nullif(func.trim(User.occupation), ""),
        literal("Unknown"),
    )
    occupation_rows = await db.execute(
        select(occupation_label.label("label"), func.count().label("n"))
        .group_by(occupation_label)
        .order_by(func.count().desc())
        .limit(12),
    )
    dob_rows = await db.execute(select(User.date_of_birth).where(User.date_of_birth.is_not(None)))
    age_group_map: dict[str, int] = {label: 0 for label in AGE_GROUP_LABELS}
    unknown_dob = 0
    for (dob,) in dob_rows.all():
        if dob is None:
            unknown_dob += 1
            continue
        group = age_group_from_dob(dob)
        age_group_map[group] = age_group_map.get(group, 0) + 1
    users_by_age_group = [LabeledCount(label=label, count=age_group_map[label]) for label in AGE_GROUP_LABELS]
    if unknown_dob:
        users_by_age_group.append(LabeledCount(label="Unknown", count=unknown_dob))
    plan_rows = await db.execute(
        select(License.plan_name.label("label"), func.count().label("n"))
        .where(_active_license_clause())
        .group_by(License.plan_name)
        .order_by(func.count().desc()),
    )
    role_rows = await db.execute(
        select(User.role.label("label"), func.count().label("n"))
        .group_by(User.role)
        .order_by(func.count().desc()),
    )

    books_topics = select(Book.title.label("topic")).select_from(Book)
    assignment_topics = select(Assignment.subject.label("topic")).select_from(Assignment)
    set_topics = select(FlashcardSet.title.label("topic")).select_from(FlashcardSet)
    topics_union = union_all(books_topics, assignment_topics, set_topics).subquery()
    topic_rows = await db.execute(
        select(topics_union.c.topic, func.count().label("n"))
        .select_from(topics_union)
        .where(func.length(func.trim(topics_union.c.topic)) > 0)
        .group_by(topics_union.c.topic)
        .order_by(func.count().desc())
        .limit(10),
    )
    top_study_topics = [
        RankedTopic(rank=i + 1, topic=row.topic, count=int(row.n))
        for i, row in enumerate(topic_rows.all())
    ]

    return DemographicsOut(
        updated_at=now,
        total_users=total_users,
        countries_distinct=countries_distinct,
        continents_distinct=continents_distinct,
        active_licenses=active_licenses,
        user_growth_monthly=user_growth_monthly,
        users_by_country=[
            LabeledCount(label=row.label, count=int(row.n)) for row in country_rows.all()
        ],
        users_by_continent=[
            LabeledCount(label=row.label, count=int(row.n)) for row in continent_rows.all()
        ],
        users_by_occupation=[
            LabeledCount(label=row.label, count=int(row.n)) for row in occupation_rows.all()
        ],
        users_by_age_group=users_by_age_group,
        plan_distribution=[
            LabeledCount(label=row.label, count=int(row.n)) for row in plan_rows.all()
        ],
        users_by_role=[
            LabeledCount(label=str(row.label.value), count=int(row.n))
            for row in role_rows.all()
        ],
        top_study_topics=top_study_topics,
    )


@router.get("/financial-analytics", response_model=FinancialAnalyticsOut)
async def financial_analytics(
    _admin: Annotated[User, Depends(require_role("admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FinancialAnalyticsOut:
    now = datetime.now(UTC)
    twelve_months_ago = datetime.combine(
        (date.today().replace(day=1) - timedelta(days=365)),
        time.min,
        tzinfo=UTC,
    )
    monthly_rev = _license_monthly_rev()

    mrr_raw = await db.scalar(
        select(func.coalesce(func.sum(monthly_rev), 0)).where(_active_license_clause()),
    )
    mrr_usd = float(mrr_raw or 0)
    paying_users = int(
        await db.scalar(
            select(func.count(func.distinct(License.user_id))).where(
                _active_license_clause(),
            ),
        )
        or 0,
    )
    arr_usd = mrr_usd * 12
    arpu = round(mrr_usd / paying_users, 2) if paying_users else 0.0

    license_month = _month_bucket(License.created_at)
    revenue_monthly_rows = await db.execute(
        select(
            _month_label(license_month).label("month"),
            func.coalesce(func.sum(monthly_rev), 0).label("revenue"),
        )
        .where(
            _active_license_clause(),
            License.created_at >= twelve_months_ago,
        )
        .group_by(license_month)
        .order_by(license_month),
    )
    revenue_monthly = [
        RevenueMonthPoint(month=row.month, revenue_usd=round(float(row.revenue or 0), 2))
        for row in revenue_monthly_rows.all()
    ]

    plan_rev_rows = await db.execute(
        select(
            License.plan_name.label("label"),
            func.coalesce(func.sum(monthly_rev), 0).label("revenue"),
        )
        .where(_active_license_clause())
        .group_by(License.plan_name)
        .order_by(func.sum(monthly_rev).desc()),
    )
    revenue_by_plan = [
        LabeledAmount(label=row.label, amount_usd=round(float(row.revenue or 0), 2))
        for row in plan_rev_rows.all()
    ]

    continent_rev_label = _geo_label(User.continent)
    continent_rev_rows = await db.execute(
        select(
            continent_rev_label.label("label"),
            func.coalesce(func.sum(monthly_rev), 0).label("revenue"),
        )
        .join(User, User.id == License.user_id)
        .where(_active_license_clause())
        .group_by(continent_rev_label)
        .order_by(func.sum(monthly_rev).desc()),
    )
    revenue_by_continent = [
        LabeledAmount(label=row.label, amount_usd=round(float(row.revenue or 0), 2))
        for row in continent_rev_rows.all()
    ]

    country_rev_label = _geo_label(User.country)
    country_rev_rows = await db.execute(
        select(
            country_rev_label.label("country"),
            func.count(func.distinct(License.user_id)).label("users"),
            func.coalesce(func.sum(monthly_rev), 0).label("revenue"),
        )
        .join(User, User.id == License.user_id)
        .where(_active_license_clause())
        .group_by(country_rev_label)
        .order_by(func.sum(monthly_rev).desc())
        .limit(10),
    )
    revenue_by_country: list[RevenueByCountryRow] = []
    for row in country_rev_rows.all():
        rev = float(row.revenue or 0)
        pct = round((rev / mrr_usd) * 100, 1) if mrr_usd else 0.0
        revenue_by_country.append(
            RevenueByCountryRow(
                country=row.country,
                users=int(row.users or 0),
                monthly_revenue_usd=round(rev, 2),
                pct_of_total=pct,
            ),
        )

    return FinancialAnalyticsOut(
        updated_at=now,
        mrr_usd=round(mrr_usd, 2),
        arr_usd=round(arr_usd, 2),
        paying_users=paying_users,
        avg_revenue_per_user_usd=arpu,
        revenue_monthly=revenue_monthly,
        revenue_by_plan=revenue_by_plan,
        revenue_by_continent=revenue_by_continent,
        revenue_by_country=revenue_by_country,
    )


@router.get("/ai-usage", response_model=AiUsageAnalyticsOut)
async def ai_usage_analytics(
    _admin: Annotated[User, Depends(require_role("admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AiUsageAnalyticsOut:
    now = datetime.now(UTC)

    totals = await db.execute(
        select(
            func.coalesce(func.sum(TokenUsage.estimated_cost_usd), 0),
            func.count(TokenUsage.id),
            func.coalesce(func.sum(TokenUsage.input_tokens), 0),
            func.coalesce(func.sum(TokenUsage.output_tokens), 0),
            func.coalesce(func.sum(TokenUsage.cached_tokens), 0),
            func.coalesce(func.avg(TokenUsage.duration_ms), 0),
        ),
    )
    total_cost, total_calls, total_in, total_out, total_cached, avg_dur = totals.one()

    feature_rows = await db.execute(
        select(
            TokenUsage.feature_type,
            func.count(TokenUsage.id),
            func.coalesce(func.sum(TokenUsage.input_tokens), 0),
            func.coalesce(func.sum(TokenUsage.output_tokens), 0),
            func.coalesce(func.sum(TokenUsage.cached_tokens), 0),
            func.coalesce(func.sum(TokenUsage.estimated_cost_usd), 0),
            func.coalesce(func.avg(TokenUsage.duration_ms), 0),
        )
        .group_by(TokenUsage.feature_type)
        .order_by(func.sum(TokenUsage.estimated_cost_usd).desc()),
    )
    by_feature = [
        AiUsageByFeature(
            feature_type=str(row[0] or "other"),
            calls=int(row[1] or 0),
            input_tokens=int(row[2] or 0),
            output_tokens=int(row[3] or 0),
            cached_tokens=int(row[4] or 0),
            total_cost_usd=round(float(row[5] or 0), 4),
            avg_duration_ms=round(float(row[6] or 0), 1),
        )
        for row in feature_rows.all()
    ]

    task_rows = await db.execute(
        select(
            TokenUsage.task,
            TokenUsage.feature_type,
            func.count(TokenUsage.id),
            func.coalesce(func.sum(TokenUsage.input_tokens), 0),
            func.coalesce(func.sum(TokenUsage.output_tokens), 0),
            func.coalesce(func.sum(TokenUsage.cached_tokens), 0),
            func.coalesce(func.sum(TokenUsage.estimated_cost_usd), 0),
            func.coalesce(func.avg(TokenUsage.duration_ms), 0),
        )
        .group_by(TokenUsage.task, TokenUsage.feature_type)
        .order_by(func.sum(TokenUsage.estimated_cost_usd).desc())
        .limit(30),
    )
    by_task = [
        AiUsageByTask(
            task=str(row[0] or ""),
            feature_type=str(row[1]) if row[1] else None,
            calls=int(row[2] or 0),
            input_tokens=int(row[3] or 0),
            output_tokens=int(row[4] or 0),
            cached_tokens=int(row[5] or 0),
            total_cost_usd=round(float(row[6] or 0), 4),
            avg_duration_ms=round(float(row[7] or 0), 1),
        )
        for row in task_rows.all()
    ]

    user_rows = await db.execute(
        select(
            TokenUsage.user_id,
            User.email,
            func.coalesce(func.sum(TokenUsage.estimated_cost_usd), 0),
            func.count(TokenUsage.id),
            func.coalesce(func.sum(TokenUsage.input_tokens), 0),
            func.coalesce(func.sum(TokenUsage.output_tokens), 0),
            func.coalesce(func.sum(TokenUsage.cached_tokens), 0),
            func.coalesce(func.avg(TokenUsage.duration_ms), 0),
        )
        .join(User, User.id == TokenUsage.user_id)
        .group_by(TokenUsage.user_id, User.email)
        .order_by(func.sum(TokenUsage.estimated_cost_usd).desc())
        .limit(50),
    )
    by_user = [
        AiUsageByUser(
            user_id=str(row[0]),
            email=str(row[1] or ""),
            total_cost_usd=round(float(row[2] or 0), 4),
            total_calls=int(row[3] or 0),
            input_tokens=int(row[4] or 0),
            output_tokens=int(row[5] or 0),
            cached_tokens=int(row[6] or 0),
            avg_duration_ms=round(float(row[7] or 0), 1),
        )
        for row in user_rows.all()
    ]

    book_rows = await db.execute(
        select(
            TokenUsage.book_id,
            Book.title,
            func.coalesce(func.sum(TokenUsage.estimated_cost_usd), 0),
            func.count(TokenUsage.id),
            func.coalesce(func.sum(TokenUsage.input_tokens), 0),
            func.coalesce(func.sum(TokenUsage.output_tokens), 0),
        )
        .join(Book, Book.id == TokenUsage.book_id)
        .where(TokenUsage.book_id.isnot(None))
        .group_by(TokenUsage.book_id, Book.title)
        .order_by(func.sum(TokenUsage.estimated_cost_usd).desc())
        .limit(20),
    )
    by_book = [
        AiUsageByBook(
            book_id=str(row[0]),
            book_title=str(row[1] or ""),
            total_cost_usd=round(float(row[2] or 0), 4),
            total_calls=int(row[3] or 0),
            input_tokens=int(row[4] or 0),
            output_tokens=int(row[5] or 0),
        )
        for row in book_rows.all()
    ]

    total_in_int = int(total_in or 0)
    cache_hit = round((int(total_cached or 0) / max(total_in_int, 1)) * 100, 1)

    return AiUsageAnalyticsOut(
        updated_at=now,
        total_cost_usd=round(float(total_cost or 0), 4),
        total_calls=int(total_calls or 0),
        total_input_tokens=total_in_int,
        total_output_tokens=int(total_out or 0),
        total_cached_tokens=int(total_cached or 0),
        avg_duration_ms=round(float(avg_dur or 0), 1),
        cache_hit_rate_pct=cache_hit,
        by_feature=by_feature,
        by_task=by_task,
        by_user=by_user,
        by_book=by_book,
        most_expensive_operations=by_feature[:10],
    )


@router.get("/ai-usage/logs", response_model=AiUsageLogsOut)
async def ai_usage_logs(
    _admin: Annotated[User, Depends(require_role("admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
    user_id: str | None = Query(None, description="Filter logs to one user"),
    task: str | None = Query(None, description="Filter by AI task name"),
    celery_task_id: str | None = Query(None, description="Filter by generation job ID"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> AiUsageLogsOut:
    filters = []
    if user_id:
        filters.append(TokenUsage.user_id == UUID(user_id))
    if task:
        filters.append(TokenUsage.task == task)
    if celery_task_id:
        filters.append(TokenUsage.celery_task_id == celery_task_id)

    count_q = select(func.count(TokenUsage.id))
    if filters:
        count_q = count_q.where(*filters)
    total = int((await db.execute(count_q)).scalar_one() or 0)

    log_q = (
        select(TokenUsage, User.email, Book.title)
        .join(User, User.id == TokenUsage.user_id)
        .outerjoin(Book, Book.id == TokenUsage.book_id)
        .order_by(TokenUsage.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    if filters:
        log_q = log_q.where(*filters)

    rows = (await db.execute(log_q)).all()
    items = [
        AiUsageLogEntry(
            id=str(usage.id),
            created_at=usage.created_at,
            user_id=str(usage.user_id),
            email=str(email or ""),
            task=usage.task,
            feature_type=usage.feature_type,
            model=usage.model,
            input_tokens=int(usage.input_tokens),
            output_tokens=int(usage.output_tokens),
            cached_tokens=int(usage.cached_tokens or 0),
            duration_ms=usage.duration_ms,
            estimated_cost_usd=round(float(usage.estimated_cost_usd), 6),
            book_id=str(usage.book_id) if usage.book_id else None,
            book_title=str(book_title) if book_title else None,
            celery_task_id=usage.celery_task_id,
            call_metadata=usage.call_metadata,
        )
        for usage, email, book_title in rows
    ]

    return AiUsageLogsOut(total=total, limit=limit, offset=offset, items=items)


@router.get("/generation-jobs/{job_id}", response_model=GenerationJobDetailOut)
async def generation_job_detail(
    job_id: str,
    _admin: Annotated[User, Depends(require_role("admin"))],
) -> GenerationJobDetailOut:
    cached = get_cached_job(job_id)
    if not cached:
        raise HTTPException(status_code=404, detail="Generation job not found or expired from cache")
    return GenerationJobDetailOut(
        job_id=job_id,
        status=cached.get("status"),
        phase=cached.get("phase"),
        qa_status=cached.get("qa_status"),
        qa_failure_reason=cached.get("qa_failure_reason"),
        qa_failure_validator=cached.get("qa_failure_validator"),
        qa_attempt=cached.get("qa_attempt"),
        qa_failures=cached.get("qa_failures"),
        generation_metrics=cached.get("generation_metrics"),
        set_id=cached.get("set_id"),
        card_count=cached.get("card_count"),
        scenario_count=cached.get("scenario_count"),
        percent_complete=cached.get("percent_complete"),
        error=cached.get("error"),
    )
