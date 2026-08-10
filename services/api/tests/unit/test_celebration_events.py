from datetime import UTC, datetime
from uuid import uuid4

from models.engagement import EngagementEvent
from services.celebration_events import events_for_trusted_row


def row(event_type: str, metadata: dict | None = None) -> EngagementEvent:
    return EngagementEvent(
        id=uuid4(), user_id=uuid4(), event_type=event_type, source="test",
        entity_type="lesson", entity_id="entity-1", metadata_=metadata or {},
        idempotency_key=f"test:{uuid4()}", occurred_at=datetime.now(UTC),
    )


def test_lesson_and_course_use_authoritative_row_ids() -> None:
    lesson = row("lesson.completed")
    course = row("course.completed")
    assert events_for_trusted_row(lesson)[0].event_id == str(lesson.id)
    assert events_for_trusted_row(lesson)[0].event_type == "lesson_complete"
    assert events_for_trusted_row(course)[0].event_type == "course_complete"


def test_streak_extension_and_milestone_are_stable_derivatives() -> None:
    extended = row("assessment.completed", {"streak_change": "extended", "streak_days": 8})
    milestone = row("assessment.completed", {"streak_change": "extended", "streak_days": 30})
    assert events_for_trusted_row(extended)[0].event_type == "streak_extended"
    result = events_for_trusted_row(milestone)[0]
    assert result.event_type == "streak_milestone"
    assert result.event_id == f"{milestone.id}:streak:30"


def test_started_or_unchanged_streak_does_not_celebrate_extension() -> None:
    assert events_for_trusted_row(row("assessment.completed", {"streak_change": "started", "streak_days": 1})) == []
