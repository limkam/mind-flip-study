"""Unit tests for TOC editor validation."""

import pytest

from services.toc_editor import normalize_toc_chapters, validate_toc_chapters


def test_normalize_renumbers_chapters():
    raw = [{"title": "Intro"}, {"title": "Chapter 2", "chapter_number": 99}]
    out = normalize_toc_chapters(raw)
    assert out[0]["chapter_number"] == 1
    assert out[1]["chapter_number"] == 2


def test_validate_rejects_empty():
    with pytest.raises(ValueError, match="at least one"):
        validate_toc_chapters([])


def test_validate_rejects_duplicate_titles():
    with pytest.raises(ValueError, match="unique"):
        validate_toc_chapters([
            {"title": "Same"},
            {"title": "same"},
        ])
