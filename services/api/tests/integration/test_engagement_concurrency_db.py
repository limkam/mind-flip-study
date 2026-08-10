from __future__ import annotations

import asyncio
import os
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from fastapi import HTTPException

from models.achievement import Achievement
from models.engagement import EngagementEvent, EngagementPreference, LearningStreak, Notification, NudgeState
from models.enums import UserRole
from models.flashcard import FlashcardSet
from models.quiz import QuizResult
from models.user import User
from services.engagement import EventInput, emit_trusted_event
from services.engagement_rules import build_candidates, select_nudge
from routers.engagement import _owned_nudge, _record_nudge_action, current_nudge, dismiss_notification, mark_notification_read


@pytest.mark.asyncio
async def test_same_event_concurrently_produces_one_event_streak_achievement_and_notification() -> None:
    url = os.getenv("ENGAGEMENT_TEST_DATABASE_URL")
    if not url:
        pytest.skip("ENGAGEMENT_TEST_DATABASE_URL is required for PostgreSQL concurrency evidence")
    engine = create_async_engine(url)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with sessions() as db:
        user = User(email=f"concurrency-{uuid.uuid4()}@example.test", hashed_password=None, role=UserRole.student, full_name="Concurrency Test", auth_provider="email", preferences={}, subscription_tier="free")
        db.add(user)
        await db.flush()
        card_set = FlashcardSet(user_id=user.id, title="Evidence set", description="{}", tags=[])
        db.add(card_set)
        await db.flush()
        result = QuizResult(user_id=user.id, set_id=card_set.id, score=0, total_questions=1, time_taken_seconds=30, extras={})
        db.add(result)
        await db.commit()
        user_id, result_id = user.id, result.id

    event = EventInput(event_type="assessment.completed", source="concurrency_test", entity_type="quiz_result", entity_id=str(result_id), metadata={"percentage": 0}, idempotency_key=f"concurrency:{result_id}", occurred_at=datetime.now(UTC))

    async def emit():
        async with sessions() as db:
            return await emit_trusted_event(db, user_id=user_id, event=event)

    outcomes = await asyncio.gather(*(emit() for _ in range(8)))
    async with sessions() as db:
        assert await db.scalar(select(func.count()).select_from(EngagementEvent).where(EngagementEvent.user_id == user_id)) == 1
        assert await db.scalar(select(func.count()).select_from(LearningStreak).where(LearningStreak.user_id == user_id)) == 1
        assert await db.scalar(select(func.count()).select_from(Achievement).where(Achievement.user_id == user_id, Achievement.achievement_type == "first_quiz")) == 1
        assert await db.scalar(select(func.count()).select_from(Notification).where(Notification.user_id == user_id, Notification.type == "achievement.unlocked")) == 1
    assert sum(created for _, created in outcomes) == 1
    await engine.dispose()


@pytest.mark.asyncio
async def test_cross_user_engagement_ids_are_rejected() -> None:
    url = os.getenv("ENGAGEMENT_TEST_DATABASE_URL")
    if not url:
        pytest.skip("ENGAGEMENT_TEST_DATABASE_URL is required")
    engine = create_async_engine(url)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with sessions() as db:
        owner = User(email=f"owner-{uuid.uuid4()}@example.test", hashed_password=None, role=UserRole.student, full_name="Owner", auth_provider="email", preferences={}, subscription_tier="free")
        attacker = User(email=f"attacker-{uuid.uuid4()}@example.test", hashed_password=None, role=UserRole.student, full_name="Attacker", auth_provider="email", preferences={}, subscription_tier="free")
        db.add_all([owner, attacker])
        await db.flush()
        note = Notification(user_id=owner.id, type="test", category="account", title="Private", body="Private", idempotency_key=f"note:{uuid.uuid4()}")
        nudge = NudgeState(user_id=owner.id, nudge_key=f"private:{uuid.uuid4()}", placement="dashboard", first_eligible_at=datetime.now(UTC), context={})
        db.add_all([note, nudge])
        await db.commit()
        for call in (lambda: mark_notification_read(note.id, attacker, db), lambda: dismiss_notification(note.id, attacker, db), lambda: _record_nudge_action(db, attacker.id, nudge.id, "dismissal", "attacker-key")):
            with pytest.raises(HTTPException) as error:
                await call()
            assert error.value.status_code == 404
    await engine.dispose()


@pytest.mark.asyncio
async def test_concurrent_nudge_impressions_are_idempotent() -> None:
    url = os.getenv("ENGAGEMENT_TEST_DATABASE_URL")
    if not url:
        pytest.skip("ENGAGEMENT_TEST_DATABASE_URL is required")
    engine = create_async_engine(url)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with sessions() as db:
        user = User(email=f"nudge-{uuid.uuid4()}@example.test", hashed_password=None, role=UserRole.student, full_name="Nudge Test", auth_provider="email", preferences={}, subscription_tier="free")
        db.add(user)
        await db.flush()
        nudge = NudgeState(user_id=user.id, nudge_key=f"concurrent:{uuid.uuid4()}", placement="dashboard", first_eligible_at=datetime.now(UTC), context={})
        db.add(nudge)
        await db.commit()
        user_id, nudge_id = user.id, nudge.id

    async def record():
        async with sessions() as db:
            await _record_nudge_action(db, user_id, nudge_id, "impression", "same-render-key")

    await asyncio.gather(*(record() for _ in range(8)))
    async with sessions() as db:
        row = await db.get(NudgeState, nudge_id)
        assert row.impression_count == 1
        assert row.last_shown_at is not None
    await engine.dispose()


@pytest.mark.asyncio
@pytest.mark.parametrize("action", ["dismissal", "conversion"])
async def test_concurrent_terminal_nudge_actions_are_serialized(action: str) -> None:
    url = os.getenv("ENGAGEMENT_TEST_DATABASE_URL")
    if not url:
        pytest.skip("ENGAGEMENT_TEST_DATABASE_URL is required")
    engine = create_async_engine(url)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with sessions() as db:
        user = User(email=f"terminal-{uuid.uuid4()}@example.test", hashed_password=None, role=UserRole.student, full_name="Terminal Test", auth_provider="email", preferences={}, subscription_tier="free")
        db.add(user)
        await db.flush()
        nudge = NudgeState(user_id=user.id, nudge_key=f"terminal:{uuid.uuid4()}", placement="dashboard", first_eligible_at=datetime.now(UTC), context={})
        db.add(nudge)
        await db.commit()
        user_id, nudge_id = user.id, nudge.id

    async def record(index: int):
        async with sessions() as db:
            await _record_nudge_action(db, user_id, nudge_id, action, f"attempt-{index}")

    await asyncio.gather(*(record(index) for index in range(8)))
    async with sessions() as db:
        row = await db.get(NudgeState, nudge_id)
        assert getattr(row, "dismissed_at" if action == "dismissal" else "converted_at") is not None
        assert len(row.context["action_keys"]) == 8
    await engine.dispose()


@pytest.mark.asyncio
async def test_nudge_fetch_is_user_scoped_and_unknown_ids_are_rejected() -> None:
    url = os.getenv("ENGAGEMENT_TEST_DATABASE_URL")
    if not url:
        pytest.skip("ENGAGEMENT_TEST_DATABASE_URL is required")
    engine = create_async_engine(url)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with sessions() as db:
        owner = User(email=f"fetch-owner-{uuid.uuid4()}@example.test", hashed_password=None, role=UserRole.student, full_name="Owner", auth_provider="email", preferences={}, subscription_tier="free", onboarding_completed=False)
        attacker = User(email=f"fetch-attacker-{uuid.uuid4()}@example.test", hashed_password=None, role=UserRole.student, full_name="Attacker", auth_provider="email", preferences={}, subscription_tier="free", onboarding_completed=True)
        db.add_all([owner, attacker])
        await db.flush()
        db.add_all([EngagementPreference(user_id=owner.id), EngagementPreference(user_id=attacker.id)])
        await db.commit()
        owner_result = await current_nudge(owner, db, "dashboard")
        assert owner_result is not None
        assert await current_nudge(attacker, db, "dashboard") is None
        with pytest.raises(HTTPException) as cross_user:
            await _owned_nudge(db, attacker.id, owner_result.id)
        assert cross_user.value.status_code == 404
        with pytest.raises(HTTPException) as unknown:
            await _owned_nudge(db, owner.id, uuid.uuid4())
        assert unknown.value.status_code == 404
    await engine.dispose()


@pytest.mark.asyncio
async def test_concurrent_nudge_selection_deduplicates_unique_user_key() -> None:
    url = os.getenv("ENGAGEMENT_TEST_DATABASE_URL")
    if not url:
        pytest.skip("ENGAGEMENT_TEST_DATABASE_URL is required")
    engine = create_async_engine(url)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with sessions() as db:
        user = User(email=f"selection-{uuid.uuid4()}@example.test", hashed_password=None, role=UserRole.student, full_name="Selection Test", auth_provider="email", preferences={}, subscription_tier="free", onboarding_completed=False)
        db.add(user)
        await db.flush()
        db.add(EngagementPreference(user_id=user.id))
        await db.commit()
        user_id = user.id

    async def fetch():
        async with sessions() as db:
            user = await db.get(User, user_id)
            selected = await select_nudge(db, user, "dashboard")
            await db.commit()
            return selected[1].id

    ids = await asyncio.gather(*(fetch() for _ in range(8)))
    async with sessions() as db:
        count = await db.scalar(select(func.count()).select_from(NudgeState).where(NudgeState.user_id == user_id, NudgeState.nudge_key == "finish_onboarding"))
        assert count == 1
    assert len(set(ids)) == 1
    await engine.dispose()


@pytest.mark.asyncio
async def test_completed_action_suppression_and_one_result_per_placement() -> None:
    url = os.getenv("ENGAGEMENT_TEST_DATABASE_URL")
    if not url:
        pytest.skip("ENGAGEMENT_TEST_DATABASE_URL is required")
    engine = create_async_engine(url)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    now = datetime.now(UTC)
    async with sessions() as db:
        user = User(email=f"completion-{uuid.uuid4()}@example.test", hashed_password=None, role=UserRole.student, full_name="Completion Test", auth_provider="email", preferences={}, subscription_tier="free", onboarding_completed=True)
        db.add(user)
        await db.flush()
        db.add(EngagementPreference(user_id=user.id))
        lesson_id, course_id = str(uuid.uuid4()), str(uuid.uuid4())
        db.add_all([
            EngagementEvent(user_id=user.id, event_type="lesson.started", source="test", entity_type="lesson", entity_id=lesson_id, metadata_={}, idempotency_key=f"start:{uuid.uuid4()}", occurred_at=now),
            EngagementEvent(user_id=user.id, event_type="assessment.completed", source="test", entity_type="lesson", entity_id=lesson_id, metadata_={}, idempotency_key=f"complete:{uuid.uuid4()}", occurred_at=now),
            EngagementEvent(user_id=user.id, event_type="course.started", source="test", entity_type="course", entity_id=course_id, metadata_={}, idempotency_key=f"course:{uuid.uuid4()}", occurred_at=now),
        ])
        await db.commit()
        learning = await build_candidates(db, user, "learning", now)
        assert all(not item.key.startswith("continue_lesson:") for item in learning)
        dashboard = await build_candidates(db, user, "dashboard", now)
        assert any(item.key == f"resume_course:{course_id}" for item in dashboard)
        selected = await select_nudge(db, user, "dashboard", now)
        assert selected is not None
        assert selected[0].key == f"resume_course:{course_id}"
    await engine.dispose()


@pytest.mark.asyncio
async def test_all_initial_nudge_candidates_and_preference_flag_suppression(monkeypatch) -> None:
    url = os.getenv("ENGAGEMENT_TEST_DATABASE_URL")
    if not url:
        pytest.skip("ENGAGEMENT_TEST_DATABASE_URL is required")
    engine = create_async_engine(url)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    now = datetime.now(UTC)
    async with sessions() as db:
        user = User(email=f"eligibility-{uuid.uuid4()}@example.test", hashed_password=None, role=UserRole.student, full_name="Eligibility Test", auth_provider="email", preferences={"settings": {"daily_goal_minutes": 20}}, subscription_tier="free", onboarding_completed=False)
        db.add(user)
        await db.flush()
        prefs = EngagementPreference(user_id=user.id)
        db.add(prefs)
        card_set = FlashcardSet(user_id=user.id, title="Eligibility set", description="{}", tags=[])
        db.add(card_set)
        await db.flush()
        lesson_id, course_id = str(uuid.uuid4()), str(uuid.uuid4())
        db.add_all([
            EngagementEvent(user_id=user.id, event_type="lesson.started", source="test", entity_type="lesson", entity_id=lesson_id, metadata_={}, idempotency_key=f"lesson:{uuid.uuid4()}", occurred_at=now),
            EngagementEvent(user_id=user.id, event_type="course.started", source="test", entity_type="course", entity_id=course_id, metadata_={}, idempotency_key=f"course:{uuid.uuid4()}", occurred_at=now),
            QuizResult(user_id=user.id, set_id=card_set.id, score=1, total_questions=1, time_taken_seconds=600, completed_at=now, extras={}),
            Notification(user_id=user.id, type="achievement.unlocked", category="achievements", title="Unlocked", body="You earned it", idempotency_key=f"achievement:{uuid.uuid4()}"),
        ])
        await db.commit()

        dashboard = await build_candidates(db, user, "dashboard", now)
        keys = {item.key.split(":", 1)[0] for item in dashboard}
        assert {"finish_onboarding", "resume_course", "daily_goal", "view_achievement"} <= keys
        learning = await build_candidates(db, user, "learning", now)
        assert [item.key for item in learning] == [f"continue_lesson:{lesson_id}"]
        assert (await select_nudge(db, user, "dashboard", now))[0].key == "finish_onboarding"

        prefs.learning_reminders = False
        await db.commit()
        assert await select_nudge(db, user, "learning", now) is None
        prefs.learning_reminders = True
        prefs.quiet_hours_start = "00:00"
        prefs.quiet_hours_end = "23:59"
        await db.commit()
        assert await select_nudge(db, user, "learning", now) is None
        prefs.quiet_hours_start = None
        prefs.quiet_hours_end = None
        await db.commit()
        monkeypatch.setattr("services.engagement_rules.settings.ENGAGEMENT_NUDGES_ENABLED", False)
        assert await select_nudge(db, user, "learning", now) is None
    await engine.dispose()
