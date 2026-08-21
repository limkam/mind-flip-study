"""Central engagement decisions and contextual nudge eligibility."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, time, timedelta
from enum import StrEnum
from typing import Any
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from models.engagement import (
    EngagementEvent,
    EngagementPreference,
    Notification,
    NudgeState,
)
from models.quiz import QuizResult
from models.user import User
from services.engagement import get_or_create_preferences, safe_timezone


class DecisionAction(StrEnum):
    notification = "notification"
    nudge = "nudge"
    email = "email"
    celebration = "celebration"
    analytics = "analytics"
    none = "none"


@dataclass(frozen=True)
class NudgeCandidate:
    key: str
    placement: str
    category: str
    priority: int
    title: str
    body: str
    action_label: str
    action_url: str
    expires_at: datetime
    max_impressions: int = 3
    cooldown: timedelta = timedelta(hours=24)
    context: dict[str, Any] | None = None


def parse_clock(value: str | None) -> time | None:
    if not value:
        return None
    hour, minute = value.split(":", 1)
    return time(int(hour), int(minute))


def is_quiet_time(now: datetime, prefs: EngagementPreference) -> bool:
    start, end = (
        parse_clock(prefs.quiet_hours_start),
        parse_clock(prefs.quiet_hours_end),
    )
    if start is None or end is None or start == end:
        return False
    local = now.astimezone(safe_timezone(prefs.timezone)).time().replace(tzinfo=None)
    return start <= local < end if start < end else local >= start or local < end


def state_allows(
    candidate: NudgeCandidate, state: NudgeState | None, now: datetime
) -> bool:
    if candidate.expires_at <= now:
        return False
    if state is None:
        return True
    if state.converted_at is not None:
        return False
    if state.expires_at is not None and state.expires_at <= now:
        return False
    if state.cooldown_until is not None and state.cooldown_until > now:
        return False
    return state.impression_count < candidate.max_impressions


def event_actions(
    event_type: str, prefs: EngagementPreference, now: datetime | None = None
) -> tuple[DecisionAction, ...]:
    supported = {
        "achievement.unlocked",
        "lesson.started",
        "course.started",
        "assessment.completed",
        "weekly_summary.eligible",
        "inactivity.eligible",
        "streak.at_risk",
    }
    if event_type not in supported:
        return (DecisionAction.none,)
    actions = [DecisionAction.analytics]
    if is_quiet_time(now or datetime.now(UTC), prefs):
        return tuple(actions)
    if (
        event_type == "achievement.unlocked"
        and prefs.in_app_enabled
        and prefs.achievement_announcements
        and settings.ENGAGEMENT_ACHIEVEMENTS_ENABLED
    ):
        if settings.ENGAGEMENT_NOTIFICATIONS_ENABLED:
            actions.append(DecisionAction.notification)
        if settings.ENGAGEMENT_NUDGES_ENABLED:
            actions.append(DecisionAction.nudge)
        if prefs.celebration_animations:
            actions.append(DecisionAction.celebration)
        if settings.ENGAGEMENT_LIFECYCLE_EMAILS_ENABLED:
            actions.append(DecisionAction.email)
    elif (
        event_type in {"lesson.started", "course.started"}
        and prefs.in_app_enabled
        and prefs.learning_reminders
        and settings.ENGAGEMENT_NUDGES_ENABLED
    ):
        actions.append(DecisionAction.nudge)
    elif event_type == "weekly_summary.eligible" and prefs.weekly_summaries:
        if settings.ENGAGEMENT_LIFECYCLE_EMAILS_ENABLED:
            actions.append(DecisionAction.email)
    if (
        settings.ENGAGEMENT_LIFECYCLE_EMAILS_ENABLED
        and prefs.learning_reminders
        and event_type in {"lesson.started", "course.started"}
    ):
        actions.append(DecisionAction.email)
    return tuple(actions)


async def _unfinished_entity(
    db: AsyncSession, user_id: UUID, entity_type: str
) -> EngagementEvent | None:
    started = (
        await db.scalars(
            select(EngagementEvent)
            .where(
                EngagementEvent.user_id == user_id,
                EngagementEvent.event_type == f"{entity_type}.started",
                EngagementEvent.entity_id.is_not(None),
            )
            .order_by(EngagementEvent.occurred_at.desc())
            .limit(20)
        )
    ).all()
    for event in started:
        completed = await db.scalar(
            select(EngagementEvent.id)
            .where(
                EngagementEvent.user_id == user_id,
                EngagementEvent.entity_id == event.entity_id,
                EngagementEvent.event_type.in_(
                    (f"{entity_type}.completed", "assessment.completed")
                ),
            )
            .limit(1)
        )
        if completed is None:
            return event
    return None


async def build_candidates(
    db: AsyncSession, user: User, placement: str, now: datetime
) -> list[NudgeCandidate]:
    candidates: list[NudgeCandidate] = []
    expires = now + timedelta(days=7)
    if placement == "dashboard" and not user.onboarding_completed:
        candidates.append(
            NudgeCandidate(
                "finish_onboarding",
                placement,
                "learning",
                100,
                "Finish setting up Bilkeys",
                "Complete your learning profile so recommendations match your goals.",
                "Continue setup",
                "/onboarding",
                expires,
            )
        )

    if placement == "learning":
        lesson = await _unfinished_entity(db, user.id, "lesson")
        if lesson:
            candidates.append(
                NudgeCandidate(
                    f"continue_lesson:{lesson.entity_id}",
                    placement,
                    "learning",
                    90,
                    "Continue where you left off",
                    "Your study set is ready when you are.",
                    "Continue studying",
                    f"/study/{lesson.entity_id}",
                    expires,
                    context={"entity_type": "lesson", "entity_id": lesson.entity_id},
                )
            )

    if placement == "dashboard":
        course = await _unfinished_entity(db, user.id, "course")
        if course:
            candidates.append(
                NudgeCandidate(
                    f"resume_course:{course.entity_id}",
                    placement,
                    "learning",
                    80,
                    "Resume your book",
                    "Continue the learning path you recently started.",
                    "Resume",
                    f"/book/{course.entity_id}",
                    expires,
                    context={"entity_type": "course", "entity_id": course.entity_id},
                )
            )

        prefs_legacy = dict((user.preferences or {}).get("settings") or {})
        goal = max(1, min(240, int(prefs_legacy.get("daily_goal_minutes", 20))))
        local_now = now.astimezone(
            safe_timezone((await get_or_create_preferences(db, user.id)).timezone)
        )
        local_start = datetime.combine(
            local_now.date(), time.min, tzinfo=local_now.tzinfo
        ).astimezone(UTC)
        seconds = int(
            await db.scalar(
                select(func.coalesce(func.sum(QuizResult.time_taken_seconds), 0)).where(
                    QuizResult.user_id == user.id,
                    QuizResult.completed_at >= local_start,
                )
            )
            or 0
        )
        minutes = seconds // 60
        if 0 < minutes < goal:
            candidates.append(
                NudgeCandidate(
                    f"daily_goal:{local_now.date()}",
                    placement,
                    "learning",
                    70,
                    "Complete today’s learning goal",
                    f"You’ve recorded {minutes} of {goal} focused minutes today.",
                    "Continue learning",
                    "/flashcard-sets",
                    datetime.combine(
                        local_now.date() + timedelta(days=1),
                        time.min,
                        tzinfo=local_now.tzinfo,
                    ).astimezone(UTC),
                    max_impressions=2,
                    context={"minutes": minutes, "goal": goal},
                )
            )

        achievement = await db.scalar(
            select(Notification)
            .where(
                Notification.user_id == user.id,
                Notification.type == "achievement.unlocked",
                Notification.read_at.is_(None),
                Notification.dismissed_at.is_(None),
            )
            .order_by(Notification.created_at.desc())
            .limit(1)
        )
        if achievement:
            candidates.append(
                NudgeCandidate(
                    f"view_achievement:{achievement.id}",
                    placement,
                    "achievements",
                    85,
                    achievement.title,
                    achievement.body,
                    "View achievement",
                    "/achievements",
                    expires,
                    max_impressions=2,
                    context={"notification_id": str(achievement.id)},
                )
            )
    return candidates


async def select_nudge(
    db: AsyncSession, user: User, placement: str, now: datetime | None = None
) -> tuple[NudgeCandidate, NudgeState] | None:
    now = now or datetime.now(UTC)
    if not settings.ENGAGEMENT_NUDGES_ENABLED:
        return None
    prefs = await get_or_create_preferences(db, user.id)
    if not prefs.in_app_enabled or is_quiet_time(now, prefs):
        return None
    candidates = await build_candidates(db, user, placement, now)
    states = (
        {
            row.nudge_key: row
            for row in (
                await db.scalars(
                    select(NudgeState).where(
                        NudgeState.user_id == user.id,
                        NudgeState.nudge_key.in_([c.key for c in candidates]),
                    )
                )
            ).all()
        }
        if candidates
        else {}
    )
    eligible = [
        candidate
        for candidate in candidates
        if (candidate.category != "achievements" or prefs.achievement_announcements)
        and (candidate.category != "learning" or prefs.learning_reminders)
        and state_allows(candidate, states.get(candidate.key), now)
    ]
    if not eligible:
        return None
    candidate = max(eligible, key=lambda item: item.priority)
    state = states.get(candidate.key)
    if state is None:
        state = NudgeState(
            user_id=user.id,
            nudge_key=candidate.key,
            placement=placement,
            first_eligible_at=now,
            expires_at=candidate.expires_at,
            context=candidate.context or {},
        )
        db.add(state)
        try:
            await db.flush()
        except IntegrityError:
            await db.rollback()
            state = await db.scalar(
                select(NudgeState).where(
                    NudgeState.user_id == user.id, NudgeState.nudge_key == candidate.key
                )
            )
            if state is None:
                raise
    return candidate, state
