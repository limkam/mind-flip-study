from datetime import UTC, date, datetime

from services.engagement import next_streak_state, safe_timezone


def test_first_meaningful_activity_starts_streak() -> None:
    assert next_streak_state(None, 0, 0, date(2026, 7, 28)) == (1, 1, "started")


def test_duplicate_same_local_day_does_not_extend_streak() -> None:
    day = date(2026, 7, 28)
    assert next_streak_state(day, 7, 9, day) == (7, 9, "unchanged")


def test_consecutive_local_day_extends_streak() -> None:
    assert next_streak_state(date(2026, 7, 27), 6, 6, date(2026, 7, 28)) == (7, 7, "extended")


def test_missed_day_starts_fresh_without_shaming_state() -> None:
    assert next_streak_state(date(2026, 7, 25), 12, 12, date(2026, 7, 28)) == (1, 12, "started")


def test_invalid_timezone_safely_falls_back_to_utc() -> None:
    assert safe_timezone("Not/A_Timezone").key == "UTC"


def test_late_event_cannot_reset_or_extend_current_streak() -> None:
    assert next_streak_state(date(2026, 7, 28), 7, 10, date(2026, 7, 20)) == (7, 10, "unchanged")


def test_midnight_offsets_use_different_local_dates() -> None:
    instant = datetime(2026, 7, 28, 0, 30, tzinfo=UTC)
    assert instant.astimezone(safe_timezone("Pacific/Honolulu")).date() == date(2026, 7, 27)
    assert instant.astimezone(safe_timezone("Pacific/Kiritimati")).date() == date(2026, 7, 28)


def test_dst_transition_preserves_local_calendar_day() -> None:
    before = datetime(2026, 3, 8, 6, 30, tzinfo=UTC).astimezone(safe_timezone("America/New_York"))
    after = datetime(2026, 3, 8, 7, 30, tzinfo=UTC).astimezone(safe_timezone("America/New_York"))
    assert before.date() == after.date() == date(2026, 3, 8)
