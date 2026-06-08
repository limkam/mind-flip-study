"""Email validation that accepts common local/dev domains (e.g. admin@mindflip.local)."""

from __future__ import annotations

import re
from typing import Annotated

from email_validator import EmailNotValidError, validate_email
from pydantic import BeforeValidator

# RFC 2606 + common local dev TLDs rejected by email-validator 2.x as "special-use".
_DEV_EMAIL_SUFFIXES = (".local", ".localhost", ".test", ".example", ".invalid")
_DEV_EMAIL_RE = re.compile(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z0-9.-]+$")


def normalize_and_validate_email(v: object) -> str:
    if not isinstance(v, str):
        raise TypeError("email must be a string")
    email = v.strip().lower()
    if not email:
        raise ValueError("email is required")
    try:
        validate_email(email, check_deliverability=False)
        return email
    except EmailNotValidError as exc:
        if any(email.endswith(suffix) for suffix in _DEV_EMAIL_SUFFIXES) and _DEV_EMAIL_RE.match(
            email
        ):
            return email
        raise ValueError(str(exc)) from exc


AppEmail = Annotated[str, BeforeValidator(normalize_and_validate_email)]
