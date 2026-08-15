"""Validate and normalize editable table-of-contents structures."""

from __future__ import annotations

from typing import Any


def _as_offset(value: Any) -> int | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return int(value) if value >= 0 else None


def normalize_toc_chapters(raw: list[Any]) -> list[dict[str, Any]]:
    """Normalize chapter list from client edits; renumber sequentially."""
    chapters: list[dict[str, Any]] = []
    for i, item in enumerate(raw):
        if not isinstance(item, dict):
            continue
        title = str(item.get("title", "")).strip()
        if not title:
            continue
        subtopics = item.get("subtopics") or []
        if not isinstance(subtopics, list):
            subtopics = []
        chapter: dict[str, Any] = {
            "chapter_number": i + 1,
            "title": title,
            "subtopics": [str(s).strip() for s in subtopics if str(s).strip()],
        }
        start_offset = _as_offset(item.get("start_offset"))
        end_offset = _as_offset(item.get("end_offset"))
        if start_offset is not None and end_offset is not None:
            chapter["start_offset"] = start_offset
            chapter["end_offset"] = end_offset
        chapters.append(chapter)
    return chapters


def validate_toc_chapters(chapters: list[dict[str, Any]], *, total_length: int | None = None) -> None:
    """Raise ValueError if TOC is invalid.

    When every chapter carries start_offset/end_offset (persisted at extraction
    time and threaded through by the editors on every edit), also enforce that
    the chapters collectively cover the whole document with no gaps or
    overlaps: chapter 0 starts at 0, each chapter ends where the next begins,
    and the last chapter ends at the document's known length.
    """
    if not chapters:
        raise ValueError("Table of contents must contain at least one chapter")
    titles = [c.get("title", "").strip().lower() for c in chapters]
    if any(not t for t in titles):
        raise ValueError("Every chapter must have a title")
    if len(set(titles)) != len(titles):
        raise ValueError("Chapter titles must be unique")

    has_offsets = ["start_offset" in c and "end_offset" in c for c in chapters]
    if not any(has_offsets):
        return
    if not all(has_offsets):
        raise ValueError("Every chapter must include coverage offsets, or none should")

    if chapters[0]["start_offset"] != 0:
        raise ValueError("The first chapter must start at the beginning of the book")
    for i, chapter in enumerate(chapters):
        if chapter["end_offset"] < chapter["start_offset"]:
            raise ValueError(f"Chapter {i + 1} has an end before its start")
        if i + 1 < len(chapters) and chapter["end_offset"] != chapters[i + 1]["start_offset"]:
            raise ValueError(f"Chapter {i + 1} does not connect to chapter {i + 2} — coverage would have a gap")
    if total_length is not None and chapters[-1]["end_offset"] != total_length:
        raise ValueError("The last chapter must end at the end of the book")
