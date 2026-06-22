"""Validate and normalize editable table-of-contents structures."""

from __future__ import annotations

from typing import Any


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
        chapters.append({
            "chapter_number": i + 1,
            "title": title,
            "subtopics": [str(s).strip() for s in subtopics if str(s).strip()],
        })
    return chapters


def validate_toc_chapters(chapters: list[dict[str, Any]]) -> None:
    """Raise ValueError if TOC is invalid."""
    if not chapters:
        raise ValueError("Table of contents must contain at least one chapter")
    titles = [c.get("title", "").strip().lower() for c in chapters]
    if any(not t for t in titles):
        raise ValueError("Every chapter must have a title")
    if len(set(titles)) != len(titles):
        raise ValueError("Chapter titles must be unique")
