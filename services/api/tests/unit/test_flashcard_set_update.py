"""Unit test for FlashcardSetUpdate schema, validation, and backend behavior (PAR-015)."""

from uuid import uuid4
import pytest
from pydantic import ValidationError

from schemas.flashcards_api import FlashcardSetOut, FlashcardSetUpdate


def test_flashcard_set_update_schema_accepts_tags():
    body = FlashcardSetUpdate(tags=["biology", "chapter-1"])
    assert body.tags == ["biology", "chapter-1"]


def test_flashcard_set_update_schema_accepts_empty_tags():
    body = FlashcardSetUpdate(tags=[])
    assert body.tags == []


def test_flashcard_set_update_schema_optional_fields():
    body = FlashcardSetUpdate()
    assert body.tags is None
    assert body.title is None
    assert body.description is None


def test_flashcard_set_update_rejects_invalid_non_array():
    with pytest.raises(ValidationError):
        FlashcardSetUpdate(tags="not-an-array")


def test_flashcard_set_update_rejects_non_string_members():
    with pytest.raises(ValidationError):
        FlashcardSetUpdate(tags=[123, True])


def test_flashcard_set_out_requires_tags_list():
    set_id = uuid4()
    user_id = uuid4()
    data = {
        "id": set_id,
        "user_id": user_id,
        "book_id": None,
        "title": "Test Deck",
        "description": None,
        "tags": ["science", "genetics"],
        "created_at": "2026-08-05T00:00:00Z",
        "updated_at": "2026-08-05T00:00:00Z",
        "cards": [],
        "card_count": 0,
    }
    obj = FlashcardSetOut.model_validate(data)
    assert obj.id == set_id
    assert obj.tags == ["science", "genetics"]
