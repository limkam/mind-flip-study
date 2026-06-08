"""Age calculation and grouping from date of birth."""

from datetime import date

import pytest

from age_utils import (
    AGE_GROUP_LABELS,
    age_group_from_dob,
    age_group_label,
    calculate_age,
    dob_range_for_age_group,
    validate_date_of_birth,
)


def test_calculate_age_before_birthday_this_year() -> None:
    assert calculate_age(date(2000, 12, 31), on_date=date(2026, 6, 8)) == 25


def test_calculate_age_after_birthday_this_year() -> None:
    assert calculate_age(date(2000, 1, 1), on_date=date(2026, 6, 8)) == 26


def test_calculate_age_on_birthday() -> None:
    assert calculate_age(date(2000, 6, 8), on_date=date(2026, 6, 8)) == 26


def test_age_group_labels() -> None:
    assert age_group_label(5) == "0-9"
    assert age_group_label(15) == "10-17"
    assert age_group_label(22) == "18-24"
    assert age_group_label(30) == "25-34"
    assert age_group_label(40) == "35-44"
    assert age_group_label(50) == "45-54"
    assert age_group_label(60) == "55-64"
    assert age_group_label(70) == "65+"


def test_age_group_from_dob() -> None:
    assert age_group_from_dob(date(2018, 1, 1), on_date=date(2026, 6, 8)) == "0-9"


def test_validate_rejects_future_dob() -> None:
    with pytest.raises(ValueError, match="future"):
        validate_date_of_birth(date(2099, 1, 1), on_date=date(2026, 6, 8))


def test_dob_range_for_age_group_18_24() -> None:
    on = date(2026, 6, 8)
    min_dob, max_dob = dob_range_for_age_group("18-24", on_date=on)
    assert calculate_age(max_dob, on_date=on) == 18
    assert calculate_age(min_dob, on_date=on) == 24


def test_age_group_constants() -> None:
    assert len(AGE_GROUP_LABELS) == 8
