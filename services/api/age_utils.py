"""Age and date-of-birth helpers — age is always derived, never stored."""

from __future__ import annotations

from datetime import date, timedelta

AGE_GROUP_LABELS: tuple[str, ...] = (
    "0-9",
    "10-17",
    "18-24",
    "25-34",
    "35-44",
    "45-54",
    "55-64",
    "65+",
)


def subtract_years(from_date: date, years: int) -> date:
    """Subtract calendar years, clamping Feb 29 → Feb 28 when needed."""
    try:
        return from_date.replace(year=from_date.year - years)
    except ValueError:
        return from_date.replace(year=from_date.year - years, day=28)


def calculate_age(date_of_birth: date, *, on_date: date | None = None) -> int:
    """Full years between date of birth and ``on_date`` (default: today UTC date)."""
    today = on_date or date.today()
    years = today.year - date_of_birth.year
    if (today.month, today.day) < (date_of_birth.month, date_of_birth.day):
        years -= 1
    return years


def age_group_label(age: int) -> str:
    if age <= 9:
        return "0-9"
    if age <= 17:
        return "10-17"
    if age <= 24:
        return "18-24"
    if age <= 34:
        return "25-34"
    if age <= 44:
        return "35-44"
    if age <= 54:
        return "45-54"
    if age <= 64:
        return "55-64"
    return "65+"


def age_group_from_dob(date_of_birth: date, *, on_date: date | None = None) -> str:
    return age_group_label(calculate_age(date_of_birth, on_date=on_date))


def validate_date_of_birth(date_of_birth: date, *, on_date: date | None = None) -> date:
    """Reject future DOB and DOB more than 120 years ago."""
    today = on_date or date.today()
    if date_of_birth > today:
        raise ValueError("Date of birth cannot be in the future")
    oldest = subtract_years(today, 120)
    if date_of_birth < oldest:
        raise ValueError("Date of birth is too far in the past")
    return date_of_birth


def dob_range_for_age_group(group: str, *, on_date: date | None = None) -> tuple[date, date]:
    """
    Inclusive DOB bounds for users whose age falls in ``group`` on ``on_date``.

    Returns ``(min_dob, max_dob)`` where younger people have later DOBs.
    """
    if group not in AGE_GROUP_LABELS:
        raise ValueError(f"Unknown age group: {group}")

    today = on_date or date.today()
    bounds: dict[str, tuple[int, int | None]] = {
        "0-9": (0, 9),
        "10-17": (10, 17),
        "18-24": (18, 24),
        "25-34": (25, 34),
        "35-44": (35, 44),
        "45-54": (45, 54),
        "55-64": (55, 64),
        "65+": (65, None),
    }
    min_age, max_age = bounds[group]
    max_dob = subtract_years(today, min_age)
    if max_age is None:
        min_dob = subtract_years(today, 120)
    else:
        min_dob = subtract_years(today, max_age + 1) + timedelta(days=1)
    return min_dob, max_dob
