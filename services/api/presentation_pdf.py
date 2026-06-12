"""Detect and extract structure from slide-deck PDF exports (PowerPoint, etc.)."""

from __future__ import annotations

import re
from io import BytesIO
from typing import Any

from pypdf import PdfReader

_SLIDE_CREATOR = re.compile(r"powerpoint|microsoft|impress|keynote|slides|presentation", re.I)
_SLIDE_HEADING = re.compile(r"^slide\s+(\d+)\b", re.I)


def is_presentation_pdf(data: bytes) -> bool:
    """Heuristic: slide exports have many pages with sparse text or PowerPoint metadata."""
    try:
        reader = PdfReader(BytesIO(data))
    except Exception:
        return False

    meta = reader.metadata or {}
    creator = " ".join(
        str(getattr(meta, k, "") or "")
        for k in ("creator", "producer", "author", "title")
    )
    if _SLIDE_CREATOR.search(creator):
        return True

    pages = reader.pages[: min(len(reader.pages), 40)]
    if len(pages) < 3:
        return False

    short_pages = 0
    for page in pages:
        try:
            text = (page.extract_text() or "").strip()
        except Exception:
            text = ""
        lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
        if len(text) < 400 and 0 < len(lines) <= 12:
            short_pages += 1

    return short_pages >= max(3, int(len(pages) * 0.6))


def extract_slides_as_chapters(data: bytes, *, max_pages: int = 80) -> list[dict[str, Any]]:
    """
    Treat each slide as a micro-chapter. Title = first substantial line on the slide.
    """
    reader = PdfReader(BytesIO(data))
    chapters: list[dict[str, Any]] = []

    for i, page in enumerate(reader.pages[:max_pages]):
        try:
            text = (page.extract_text() or "").strip()
        except Exception:
            text = ""

        title = _slide_title_from_text(text, slide_number=i + 1)
        if not title:
            continue

        chapters.append(
            {
                "chapter_number": len(chapters) + 1,
                "title": title,
                "subtopics": [],
                "_slide_index": i,
            },
        )

    return chapters


def _slide_title_from_text(text: str, *, slide_number: int) -> str:
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    if not lines:
        return f"Slide {slide_number}"

    for ln in lines[:6]:
        if _SLIDE_HEADING.match(ln):
            continue
        if len(ln) < 4:
            continue
        if re.match(r"^\d{1,3}$", ln):
            continue
        cleaned = re.sub(r"\s+", " ", ln)[:120].strip()
        if cleaned:
            return cleaned

    return f"Slide {slide_number}"


def build_slide_content_map(data: bytes, chapters: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Per-slide text segments for generation (max ~8k chars each)."""
    reader = PdfReader(BytesIO(data))
    segments: list[dict[str, Any]] = []

    for ch in chapters:
        idx = ch.get("_slide_index", ch.get("chapter_number", 1) - 1)
        if idx < 0 or idx >= len(reader.pages):
            continue
        try:
            text = (reader.pages[idx].extract_text() or "").strip()
        except Exception:
            text = ""
        if not text:
            continue
        title = str(ch.get("title") or f"Slide {idx + 1}")
        segments.append(
            {
                "title": title,
                "text": text[:8000],
                "char_count": len(text),
                "index": len(segments),
            },
        )

    return segments
