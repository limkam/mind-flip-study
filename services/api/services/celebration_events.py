"""Presentation-safe events derived only from committed, trusted engagement rows."""

from models.engagement import EngagementEvent
from schemas.quiz_api import CelebrationEventOut

MILESTONES = {3, 7, 30, 100}


def events_for_trusted_row(row: EngagementEvent, *, title: str | None = None) -> list[CelebrationEventOut]:
    events: list[CelebrationEventOut] = []
    mapping = {"lesson.completed": "lesson_complete", "course.completed": "course_complete"}
    event_type = mapping.get(row.event_type)
    if event_type:
        events.append(CelebrationEventOut(
            event_id=str(row.id), event_type=event_type, occurred_at=row.occurred_at,
            entity_id=row.entity_id, title=title,
            message="Lesson completed." if event_type == "lesson_complete" else "You completed the course.",
        ))
    days = int((row.metadata_ or {}).get("streak_days") or 0)
    change = (row.metadata_ or {}).get("streak_change")
    if change == "extended":
        milestone = days in MILESTONES
        events.append(CelebrationEventOut(
            event_id=f"{row.id}:streak:{days}", event_type="streak_milestone" if milestone else "streak_extended",
            occurred_at=row.occurred_at, entity_id=str(days),
            title=f"{days}-day learning streak", message=f"Your streak increased to {days} days.",
            metadata={"streakDays": days},
        ))
    for achievement in (row.metadata_ or {}).get("achievement_unlocks") or []:
        if not isinstance(achievement, dict) or not achievement.get("id"):
            continue
        events.append(CelebrationEventOut(
            event_id=f"achievement:{achievement['id']}",
            event_type="achievement_unlock",
            occurred_at=row.occurred_at,
            entity_id=str(achievement["id"]),
            title=f"Achievement unlocked: {achievement.get('title') or 'New achievement'}",
            message=str(achievement.get("description") or "You reached a meaningful learning milestone."),
            metadata={"major": bool(achievement.get("major", False))},
        ))
    return events
