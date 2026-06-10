"""Extract and align table of contents from uploaded PDFs."""

from __future__ import annotations

import logging
import re
from typing import Any

from ai_generation import parse_model_json
from anthropic_client import CLAUDE_SONNET_MODEL, get_anthropic_client
from content_map import _find_title_pos, build_content_map
from pdf_text import extract_pdf_text, toc_sample_text

log = logging.getLogger(__name__)

TOC_SYSTEM = """You are an expert at reading academic PDFs and extracting table of contents structure.
Always respond with valid JSON only.
Format: {"chapters":[{"chapter_number":1,"title":"Exact or best-match chapter title from the text","subtopics":["..."]}]}
Use titles that actually appear in the provided PDF text when possible."""


def _normalize_chapters(raw: list[Any]) -> list[dict[str, Any]]:
    chapters: list[dict[str, Any]] = []
    for i, item in enumerate(raw):
        if not isinstance(item, dict):
            continue
        title = str(item.get("title", "")).strip()
        if not title:
            continue
        num = item.get("chapter_number")
        try:
            chapter_number = int(num) if num is not None else i + 1
        except (TypeError, ValueError):
            chapter_number = i + 1
        subtopics = item.get("subtopics") or []
        if not isinstance(subtopics, list):
            subtopics = []
        chapters.append(
            {
                "chapter_number": chapter_number,
                "title": title,
                "subtopics": [str(s).strip() for s in subtopics if str(s).strip()],
            },
        )
    return chapters


def _align_chapter_titles(chapters: list[dict[str, Any]], full_text: str) -> list[dict[str, Any]]:
    """Snap AI TOC titles to strings that exist in the PDF for reliable content mapping."""
    if not full_text.strip() or not chapters:
        return chapters
    text_lower = full_text.lower()
    aligned: list[dict[str, Any]] = []
    for ch in chapters:
        title = str(ch.get("title", "")).strip()
        if not title:
            continue
        pos = _find_title_pos(text_lower, title)
        if pos == -1:
            # Try stripping leading "Chapter N:" prefixes
            stripped = re.sub(r"^(chapter|ch\.?)\s*\d+[\s:\.-]*", "", title, flags=re.I).strip()
            if stripped and stripped != title:
                pos = _find_title_pos(text_lower, stripped)
                if pos != -1:
                    title = stripped
        aligned.append({**ch, "title": title})
    # Drop chapters with no text anchor if we still have enough matches
    verified = [c for c in aligned if _find_title_pos(text_lower, c["title"]) != -1]
    if len(verified) >= max(2, len(chapters) // 2):
        return verified
    return aligned


def extract_toc_from_pdf_bytes(
    pdf_bytes: bytes,
    *,
    title: str,
    author: str,
    description: str | None = None,
) -> list[dict[str, Any]]:
    full_text = extract_pdf_text(pdf_bytes)
    if not full_text.strip():
        log.warning("toc_extract_empty_pdf", extra={"title": title})
        return []

    sample = toc_sample_text(full_text)
    desc = f"\nDescription: {description}" if description else ""
    client = get_anthropic_client()
    message = client.messages.create(
        model=CLAUDE_SONNET_MODEL,
        max_tokens=2048,
        system=TOC_SYSTEM,
        messages=[
            {
                "role": "user",
                "content": (
                    f'Extract the table of contents for "{title}" by {author}.{desc}\n\n'
                    f"PDF TEXT (excerpt):\n{sample}\n\n"
                    "Return ONLY JSON. Prefer chapter titles copied from the PDF text."
                ),
            },
        ],
    )
    raw = "".join(b.text for b in message.content if hasattr(b, "text"))
    data = parse_model_json(raw)
    chapters = _normalize_chapters(data.get("chapters") or [])
    if not chapters:
        # Fallback: infer sections from content map pseudo-split
        segments = build_content_map(full_text, None)
        chapters = [
            {
                "chapter_number": i + 1,
                "title": seg.title,
                "subtopics": [],
            }
            for i, seg in enumerate(segments)
        ]
    return _align_chapter_titles(chapters, full_text)
