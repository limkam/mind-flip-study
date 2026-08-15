from datetime import date

import pytest
from pydantic import ValidationError

from schemas.auth import EmailAuthVerifyRequest, RegisterRequest


def _dob_for_age(years: int, *, birthday_tomorrow: bool = False) -> date:
    today = date.today()
    if birthday_tomorrow:
        from datetime import timedelta
        tomorrow = today + timedelta(days=1)
        return tomorrow.replace(year=tomorrow.year - years)
    return today.replace(year=today.year - years)


def test_register_accepts_user_exactly_thirteen() -> None:
    body = RegisterRequest(email="thirteen@example.com", password="password123", full_name="Thirteen", date_of_birth=_dob_for_age(13))
    assert body.date_of_birth == _dob_for_age(13)


def test_register_accepts_user_older_than_thirteen() -> None:
    assert RegisterRequest(email="adult@example.com", password="password123", full_name="Adult", date_of_birth=_dob_for_age(30))


def test_register_rejects_under_thirteen_and_missing_or_invalid_dob() -> None:
    with pytest.raises(ValidationError, match="13 and above"):
        RegisterRequest(email="young@example.com", password="password123", full_name="Young", date_of_birth=_dob_for_age(13, birthday_tomorrow=True))
    with pytest.raises(ValidationError):
        RegisterRequest.model_validate({"email": "missing@example.com", "password": "password123", "full_name": "Missing"})
    with pytest.raises(ValidationError):
        RegisterRequest.model_validate({"email": "bad@example.com", "password": "password123", "full_name": "Bad", "date_of_birth": "not-a-date"})


def test_passwordless_backend_rejects_underage_dob_even_if_frontend_is_bypassed() -> None:
    with pytest.raises(ValidationError, match="13 and above"):
        EmailAuthVerifyRequest(challenge_id="x" * 24, code="123456", date_of_birth=_dob_for_age(13, birthday_tomorrow=True))


def test_existing_passwordless_users_can_verify_without_dob() -> None:
    body = EmailAuthVerifyRequest(challenge_id="x" * 24, code="123456")
    assert body.date_of_birth is None
