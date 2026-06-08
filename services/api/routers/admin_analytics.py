"""Admin analytics dashboards — server-side SQL aggregations only."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta, time
from typing import Annotated

from fastapi import APIRouter, Depends
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
from models.user import User
from schemas.admin_analytics import (
    ActiveUserRow,
    AppMonitoringOut,
    AssignmentHealthOut,
    ContentCreatedMonth,
    DailyActivityPoint,
    DemographicsOut,
    FeatureUsagePoint,
    FinancialAnalyticsOut,
    LabeledAmount,
    LabeledCount,
    PlatformStatsOut,
    RankedTopic,
    RevenueByCountryRow,
    RevenueMonthPoint,
    UserGrowthMonth,
)

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
