"""Unit tests for chapter/content coverage guarantees."""

from content_map import build_content_map, _split_pseudo_chapters


def _assert_full_coverage(segments, text_len):
    assert segments, "expected at least one segment"
    assert segments[0].start == 0
    for i, seg in enumerate(segments):
        assert seg.end >= seg.start
        if i + 1 < len(segments):
            assert seg.end == segments[i + 1].start
    assert segments[-1].end == text_len


def test_build_content_map_covers_whole_document_with_matched_titles():
    text = (
        "Intro material before any heading.\n\n"
        "Chapter One\nSome content about topic one that goes on for a while.\n\n"
        "Chapter Two\nSome content about topic two that also goes on for a while.\n\n"
        "Closing remarks after the last heading."
    )
    segments = build_content_map(text, ["Chapter One", "Chapter Two"])
    _assert_full_coverage(segments, len(text.strip()))
    # Front matter before "Chapter One" is folded into the first chapter, not dropped.
    assert "Intro material" in segments[0].text


def test_build_content_map_covers_whole_document_when_a_title_is_unmatched():
    text = "A" * 500 + "Chapter Two" + "B" * 500
    segments = build_content_map(text, ["Chapter One (not in text)", "Chapter Two"])
    assert len(segments) == 2
    _assert_full_coverage(segments, len(text.strip()))


def test_build_content_map_pseudo_fallback_covers_whole_document():
    text = "word " * 2000
    segments = build_content_map(text, ["Nonexistent A", "Nonexistent B", "Nonexistent C"])
    _assert_full_coverage(segments, len(text.strip()))


def test_split_pseudo_chapters_covers_whole_document():
    text = "word " * 2000
    segments = _split_pseudo_chapters(text, 4)
    _assert_full_coverage(segments, len(text.strip()))


def test_build_content_map_no_titles_falls_back_to_pseudo_and_covers_document():
    text = "word " * 2000
    segments = build_content_map(text, None)
    _assert_full_coverage(segments, len(text.strip()))
