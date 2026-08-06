"""Validation tests for client study events (StudyClientEventIn)."""

from uuid import UUID, uuid4

import pytest
from pydantic import ValidationError

from routers.study import StudyClientEventIn


def test_study_client_event_valid_payload():
    set_id = uuid4()
    body = StudyClientEventIn(
        event_type="game_save_error",
        set_id=set_id,
        metadata={"mode": "game", "error_category": "network"},
    )
    assert body.event_type == "game_save_error"
    assert body.set_id == set_id
    assert body.metadata == {"mode": "game", "error_category": "network"}


def test_study_client_event_optional_fields():
    body = StudyClientEventIn(event_type="game_quiz_save_error")
    assert body.event_type == "game_quiz_save_error"
    assert body.set_id is None
    assert body.metadata is None


def test_study_client_event_rejects_empty_event_type():
    with pytest.raises(ValidationError):
        StudyClientEventIn(event_type="")


def test_study_client_event_rejects_long_event_type():
    with pytest.raises(ValidationError):
        StudyClientEventIn(event_type="a" * 65)
