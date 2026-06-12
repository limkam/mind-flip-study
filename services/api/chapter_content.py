"""Persist and reuse extracted chapter text across AI generations."""

from __future__ import annotations

import hashlib
from datetime import UTC, datetime
from typing import Any

from content_map import CHAPTER_TEXT_MAX, ChapterSegment, build_content_map


def pdf_text_hash(full_text: str) -> str:
    return hashlib.sha256(full_text.encode("utf-8", errors="ignore")).hexdigest()


def get_cached_chapter_content(extras: dict[str, Any] | None, chapter_title: str) -> str | None:
    store = (extras or {}).get("chapter_content") or {}
    entry = store.get(chapter_title)
    if isinstance(entry, dict):
        text = str(entry.get("text") or "").strip()
        if text:
            return text
    return None


def persist_chapter_segments(
    extras: dict[str, Any] | None,
    segments: list[ChapterSegment],
    *,
    text_hash: str,
) -> dict[str, Any]:
    """Merge chapter text into book extras for reuse."""
    merged = dict(extras or {})
    store = dict(merged.get("chapter_content") or {})
    now = datetime.now(UTC).isoformat()
    for seg in segments:
        existing = store.get(seg.title) or {}
        if isinstance(existing, dict) and existing.get("text") and existing.get("text_hash") == text_hash:
            continue
        store[seg.title] = {
            "text": seg.text[:CHAPTER_TEXT_MAX],
            "char_count": seg.char_count,
            "extracted_at": now,
            "text_hash": text_hash,
        }
    merged["chapter_content"] = store
    merged["extracted_text_hash"] = text_hash
    return merged


def resolve_chapter_segments(
    *,
    full_text: str,
    toc_titles: list[str],
    selected: list[str] | None,
    extras: dict[str, Any] | None,
) -> list[ChapterSegment]:
    """
    Build chapter segments, reusing persisted text when the PDF hash matches.
    """
    text_hash = pdf_text_hash(full_text)
    cached_hash = (extras or {}).get("extracted_text_hash")
    store = (extras or {}).get("chapter_content") or {}

    if cached_hash == text_hash and store:
        titles = [t.strip() for t in (selected or toc_titles or []) if t and str(t).strip()]
        if not titles:
            titles = list(store.keys())
        segments: list[ChapterSegment] = []
        for i, title in enumerate(titles):
            entry = store.get(title)
            if isinstance(entry, dict):
                text = str(entry.get("text") or "").strip()
                if text:
                    segments.append(
                        ChapterSegment(
                            title=title,
                            text=text,
                            char_count=len(text),
                            index=i,
                        ),
                    )
        if segments:
            return segments

    return build_content_map(full_text, toc_titles, selected=selected)
