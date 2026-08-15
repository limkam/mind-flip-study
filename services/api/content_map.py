"""Build a chapter-level content map from PDF text and table of contents."""

from __future__ import annotations

import re
from dataclasses import dataclass, asdict
from typing import Any


CHAPTER_TEXT_MAX = 8_000
DEFAULT_PSEUDO_CHAPTERS = 4


@dataclass
class ChapterSegment:
    title: str
    text: str
    char_count: int
    index: int
    start: int = 0
    end: int = 0

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _normalize_title(title: str) -> str:
    t = re.sub(r"\s+", " ", (title or "").strip().lower())
    t = re.sub(r"[^\w\s]", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def _find_title_pos(text_lower: str, title: str, start: int = 0) -> int:
    needle = _normalize_title(title)
    if not needle or len(needle) < 3:
        return -1
    normalized_doc = _normalize_title(text_lower[start:])
    pos = normalized_doc.find(needle)
    if pos != -1:
        return start + pos
    # Original case-insensitive search on raw text
    pos = text_lower.find(title.lower().strip(), start)
    if pos != -1:
        return pos
    short = needle[:40]
    if len(short) >= 6:
        pos = normalized_doc.find(short)
        if pos != -1:
            return start + pos
    # Match significant words (3+ chars) in sequence
    words = [w for w in needle.split() if len(w) >= 4][:6]
    if len(words) >= 2:
        pattern = r"\s+".join(re.escape(w) for w in words)
        m = re.search(pattern, normalized_doc)
        if m:
            return start + m.start()
    return -1


def _split_pseudo_chapters(full_text: str, count: int = DEFAULT_PSEUDO_CHAPTERS) -> list[ChapterSegment]:
    text = full_text.strip()
    if not text:
        return []
    count = max(1, min(count, 8))
    chunk_size = max(1, len(text) // count)
    segments: list[ChapterSegment] = []
    for i in range(count):
        start = i * chunk_size
        end = len(text) if i == count - 1 else min(len(text), (i + 1) * chunk_size)
        excerpt = text[start:end][:CHAPTER_TEXT_MAX].strip()
        segments.append(
            ChapterSegment(
                title=f"Section {i + 1}",
                text=excerpt,
                char_count=end - start,
                index=i,
                start=start,
                end=end,
            ),
        )
    return segments


def _resolve_contiguous_starts(positions: list[int | None], text_len: int) -> list[int]:
    """
    Force full-document coverage: the first chapter always starts at 0, and any
    chapter whose title couldn't be located inherits the previous chapter's
    boundary (making it a zero-length chapter rather than leaving a gap).
    Matched positions are already non-decreasing by construction (see the
    forward-only cursor search in build_content_map), so this stays monotonic.
    """
    starts = list(positions)
    if starts:
        starts[0] = 0
    last = 0
    for i, pos in enumerate(starts):
        if pos is None:
            starts[i] = last
        else:
            last = min(text_len, pos)
            starts[i] = last
    return [s if s is not None else 0 for s in starts]


def build_content_map(
    full_text: str,
    chapter_titles: list[str] | None,
    *,
    selected: list[str] | None = None,
) -> list[ChapterSegment]:
    """
    Segment document text by TOC chapter titles, guaranteeing the segments
    collectively cover the entire document with no gaps or overlaps: the
    first segment starts at 0, each segment ends where the next begins, and
    the last segment ends at len(full_text).
    Falls back to equal-length pseudo-sections when titles cannot be aligned.
    """
    text = full_text.strip()
    if not text:
        return []

    titles = [t.strip() for t in (selected or chapter_titles or []) if t and str(t).strip()]
    if not titles:
        return _split_pseudo_chapters(text)

    text_lower = text.lower()
    raw_positions: list[int | None] = []
    cursor = 0
    for title in titles:
        pos = _find_title_pos(text_lower, title, cursor)
        if pos == -1:
            raw_positions.append(None)
            continue
        raw_positions.append(pos)
        cursor = pos + max(3, len(title) // 2)

    found_count = sum(1 for p in raw_positions if p is not None)
    if found_count < max(1, len(titles) // 2):
        # Too few matches — weighted pseudo split using requested titles as labels
        pseudo = _split_pseudo_chapters(text, len(titles))
        return [
            ChapterSegment(
                title=titles[i] if i < len(titles) else seg.title,
                text=seg.text,
                char_count=seg.char_count,
                index=i,
                start=seg.start,
                end=seg.end,
            )
            for i, seg in enumerate(pseudo)
        ]

    starts = _resolve_contiguous_starts(raw_positions, len(text))
    segments: list[ChapterSegment] = []
    for i, title in enumerate(titles):
        start = starts[i]
        end = starts[i + 1] if i + 1 < len(starts) else len(text)
        excerpt = text[start:end][:CHAPTER_TEXT_MAX].strip()
        segments.append(
            ChapterSegment(title=title, text=excerpt, char_count=end - start, index=i, start=start, end=end),
        )

    return segments


def content_map_to_metadata(segments: list[ChapterSegment]) -> list[dict[str, Any]]:
    return [seg.to_dict() for seg in segments]
