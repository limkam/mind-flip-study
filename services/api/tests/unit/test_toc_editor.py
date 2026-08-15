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


def test_normalize_passes_through_offsets():
    raw = [
        {"title": "One", "start_offset": 0, "end_offset": 50},
        {"title": "Two", "start_offset": 50, "end_offset": 100},
    ]
    out = normalize_toc_chapters(raw)
    assert out[0]["start_offset"] == 0
    assert out[0]["end_offset"] == 50
    assert out[1]["start_offset"] == 50
    assert out[1]["end_offset"] == 100


def test_normalize_drops_partial_offsets():
    raw = [{"title": "One", "start_offset": 0}]
    out = normalize_toc_chapters(raw)
    assert "start_offset" not in out[0]
    assert "end_offset" not in out[0]


def test_validate_skips_coverage_check_without_offsets():
    # Legacy chapters with no offsets at all — allowed, no coverage enforced.
    validate_toc_chapters([{"title": "One"}, {"title": "Two"}])


def test_validate_accepts_full_coverage():
    validate_toc_chapters(
        [
            {"title": "One", "start_offset": 0, "end_offset": 50},
            {"title": "Two", "start_offset": 50, "end_offset": 100},
        ],
        total_length=100,
    )


def test_validate_rejects_gap_between_chapters():
    with pytest.raises(ValueError, match="gap"):
        validate_toc_chapters(
            [
                {"title": "One", "start_offset": 0, "end_offset": 40},
                {"title": "Two", "start_offset": 50, "end_offset": 100},
            ],
            total_length=100,
        )


def test_validate_rejects_first_chapter_not_starting_at_zero():
    with pytest.raises(ValueError, match="beginning"):
        validate_toc_chapters(
            [{"title": "One", "start_offset": 10, "end_offset": 100}],
            total_length=100,
        )


def test_validate_rejects_last_chapter_not_reaching_end():
    with pytest.raises(ValueError, match="end of the book"):
        validate_toc_chapters(
            [{"title": "One", "start_offset": 0, "end_offset": 90}],
            total_length=100,
        )


def test_validate_rejects_mixed_offset_presence():
    with pytest.raises(ValueError, match="coverage offsets"):
        validate_toc_chapters(
            [
                {"title": "One", "start_offset": 0, "end_offset": 50},
                {"title": "Two"},
            ],
        )
