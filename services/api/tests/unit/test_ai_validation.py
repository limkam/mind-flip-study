"""AI JSON validation — no DB or API calls."""

import pytest

from ai_generation import parse_model_json, validate_flashcards, validate_workbook_content


def test_parse_model_json_strips_markdown_fence():
    raw = 'Here you go:\n{"cards": [{"front": "Q", "back": "A"}]}\n'
    data = parse_model_json(raw)
    assert "cards" in data


def test_validate_flashcards_rejects_empty_front():
    with pytest.raises(ValueError):
        validate_flashcards([{"front": "", "back": "a"}])


def test_validate_workbook_requires_chapters():
    with pytest.raises(ValueError):
        validate_workbook_content({"chapters": []})


def test_malformed_json_raises_before_persist():
    with pytest.raises(ValueError):
        parse_model_json("not json at all")
