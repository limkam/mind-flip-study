"""Extract and align table of contents from uploaded PDFs."""

from __future__ import annotations

import logging
import re
from io import BytesIO
from typing import Any

from pypdf import PdfReader

from ai_generation import parse_model_json
from anthropic_client import CLAUDE_SONNET_MODEL, get_anthropic_client
from content_map import _find_title_pos, build_content_map
from pdf_text import extract_pdf_text, toc_sample_text

log = logging.getLogger(__name__)

TOC_SYSTEM = """You are an expert at reading books, reports, and blog compilations and extracting table of contents structure.
Always respond with valid JSON only.
Format: {"chapters":[{"chapter_number":1,"title":"Exact section title from the text","subtopics":["..."]}]}
Rules:
- Include EVERY top-level section/chapter/essay in document order — typical books have 8-30 sections; do NOT stop after 1-2.
- Blog compilations and memoirs often have 15-25 essay titles with NO "Chapter" prefix — include ALL of them.
- If a numbered candidate list is provided, return EVERY item from that list unless clearly wrong.
- Use titles that actually appear in the provided PDF text when possible.
- Number sections sequentially starting at 1.
- subtopics may be empty."""

_NOISE_LINE = re.compile(
    r"^(page \d|copyright|©|all rights|www\.|http|isbn|table of contents|\d+$|mindflip)",
    re.I,
)


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


def _strip_page_number(title: str) -> str:
    """Remove TOC leader dots and trailing page number only (not title-ending digits)."""
    return re.sub(r"\s*[.\·\u2024\s]{2,}\s*\d+\s*$", "", title.strip()).strip()


def _chapter_dict(title: str, index: int) -> dict[str, Any]:
    return {"chapter_number": index + 1, "title": title, "subtopics": []}


def _score_chapter_list(chapters: list[dict[str, Any]]) -> tuple[int, int, int]:
    """Higher is better: (count, chapter_like_titles, -part_like_titles)."""
    chapter_re = re.compile(r"^(?:chapter|ch\.?|unit|lesson)\s+(\d+|[IVXLC]+)\b", re.I)
    part_re = re.compile(r"^part\s+([IVXLC]+|\d+)\b", re.I)
    titles = [str(c.get("title", "")).strip() for c in chapters]
    chapter_like = sum(1 for t in titles if chapter_re.match(t))
    part_like = sum(1 for t in titles if part_re.match(t))
    return (len(chapters), chapter_like, -part_like)


def _pick_best_toc(candidates: list[tuple[list[dict[str, Any]], str]]) -> tuple[list[dict[str, Any]], str]:
    valid = [(ch, method) for ch, method in candidates if len(ch) >= 2]
    if not valid:
        return [], "none"
    valid.sort(key=lambda item: (len(item[0]), _score_chapter_list(item[0])), reverse=True)
    return valid[0]


def _align_chapter_titles(chapters: list[dict[str, Any]], full_text: str) -> list[dict[str, Any]]:
    """Snap TOC titles to strings in the PDF when possible — never drop chapters."""
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
            stripped = re.sub(r"^(chapter|ch\.?)\s*\d+[\s:\.-]*", "", title, flags=re.I).strip()
            if stripped and stripped != title:
                pos = _find_title_pos(text_lower, stripped)
                if pos != -1:
                    title = stripped
        aligned.append({**ch, "title": title})
    return aligned


def _flatten_outline(items: list[Any], depth: int = 0) -> list[tuple[str, int]]:
    out: list[tuple[str, int]] = []
    for item in items or []:
        if isinstance(item, list):
            out.extend(_flatten_outline(item, depth + 1))
            continue
        try:
            title = str(getattr(item, "title", "") or "").strip()
        except Exception:
            title = ""
        if title:
            out.append((title, depth))
        try:
            children = getattr(item, "children", None) or []
            if children:
                out.extend(_flatten_outline(list(children), depth + 1))
        except Exception:
            pass
    return out


def extract_toc_from_bookmarks(pdf_bytes: bytes) -> list[dict[str, Any]]:
    """Use PDF outline/bookmarks — prefer chapter-level entries over Part/Section groupings."""
    chapter_re = re.compile(r"^(?:chapter|ch\.?|unit|lesson)\s+(\d+|[IVXLC]+)\b", re.I)
    try:
        reader = PdfReader(BytesIO(pdf_bytes))
        outline = reader.outline
        if not outline:
            return []
        flat = _flatten_outline(list(outline))
        if not flat:
            return []

        by_depth: dict[int, list[str]] = {}
        for title, depth in flat:
            if len(title) >= 3:
                by_depth.setdefault(depth, []).append(title)

        best_titles: list[str] = []
        best_score = (-1, -1, -1)
        for depth in sorted(by_depth.keys()):
            titles = by_depth[depth]
            if len(titles) < 2:
                continue
            chapters = [_chapter_dict(t, i) for i, t in enumerate(titles)]
            score = _score_chapter_list(chapters)
            if score > best_score:
                best_score = score
                best_titles = titles

        chapter_like = [t for t, _ in flat if chapter_re.match(t)]
        if len(chapter_like) >= 2 and len(chapter_like) > len(best_titles):
            best_titles = chapter_like

        if len(best_titles) < 2:
            best_titles = [t for t, _ in flat if len(t) >= 3]

        if len(best_titles) < 2:
            return []

        return [_chapter_dict(title, i) for i, title in enumerate(best_titles[:60])]
    except Exception as exc:
        log.debug("bookmark_toc_failed", extra={"error": str(exc)})
        return []


_TOC_ENTRY_PATTERNS = [
    re.compile(
        r"^(?:chapter|ch\.?)\s*(\d+|[IVXLC]+)\s*[:\.\-\s]+(.+?)(?:\s*[.\·\u2024\s]{2,}\s*\d+\s*)?$",
        re.I,
    ),
    re.compile(r"^(\d+)\.\s+(.+?)(?:\s*[.\·\u2024\s]{2,}\s*\d+\s*)?$"),
    re.compile(r"^(\d+)\s+([A-Z][\w\s\-:,()'/&]{3,100})(?:\s*[.\·\u2024\s]{2,}\s*\d+\s*)?$"),
]


def extract_toc_from_text(full_text: str) -> list[dict[str, Any]]:
    """Parse the table-of-contents pages from extracted PDF text."""
    if not full_text.strip():
        return []

    lines = full_text.splitlines()
    start = 0
    for i, line in enumerate(lines[:1000]):
        if re.search(r"\btable of contents\b|\bcontents\b", line, re.I):
            start = i
            break

    search_end = min(len(lines), start + 600)
    if start == 0:
        search_end = min(len(lines), 500)

    found: list[dict[str, Any]] = []
    seen: set[str] = set()
    blank_run = 0

    for line in lines[start:search_end]:
        stripped = re.sub(r"\s+", " ", line.strip())
        if not stripped:
            blank_run += 1
            if blank_run >= 10 and len(found) >= 5:
                break
            continue
        blank_run = 0

        for pat in _TOC_ENTRY_PATTERNS:
            m = pat.match(stripped)
            if not m:
                continue
            title = _strip_page_number(m.group(m.lastindex or 2))
            if len(title) < 3 or len(title) > 120:
                continue
            key = title.lower()
            if key in seen:
                break
            seen.add(key)
            found.append(_chapter_dict(title, len(found)))
            break

        if len(found) >= 60:
            break

    return found if len(found) >= 3 else []


_NUMBERED_LIST_LINE = re.compile(
    r"^(\d{1,2})\s+(.{5,100}?)(?:\s*[.\·\u2024\s]{2,}\s*\d+\s*)?$",
)


def extract_toc_from_numbered_list(full_text: str) -> list[dict[str, Any]]:
    """Parse numbered TOC lines like '1 Who's Frying Baloney?' (blog-style, no 'Chapter' prefix)."""
    if not full_text.strip():
        return []

    lines = full_text.splitlines()
    start = 0
    for i, line in enumerate(lines[:1200]):
        if re.search(r"\btable of contents\b|\bcontents\b", line, re.I):
            start = i
            break

    search_end = min(len(lines), start + 800)
    if start == 0:
        search_end = min(len(lines), 700)

    entries: list[tuple[int, str]] = []
    seen: set[str] = set()
    for line in lines[start:search_end]:
        stripped = re.sub(r"\s+", " ", line.strip())
        m = _NUMBERED_LIST_LINE.match(stripped)
        if not m:
            continue
        num = int(m.group(1))
        title = _strip_page_number(m.group(2))
        if len(title) < 5 or len(title) > 110:
            continue
        key = title.lower()
        if key in seen:
            continue
        seen.add(key)
        entries.append((num, title))

    if len(entries) < 3:
        return []

    entries.sort(key=lambda x: x[0])
    # Accept sequential lists starting at 1 (allow gaps)
    if entries[0][0] != 1:
        return []

    return [_chapter_dict(title, i) for i, (_, title) in enumerate(entries[:60])]


_CHAPTER_MARKER_ONLY = re.compile(r"^(?:ch\.?\s*|chapter\s+)(\d{1,2})\.?\s*[:\.\-\s]*$", re.I)
_CHAPTER_MARKER_INLINE = re.compile(
    r"^(?:ch\.?\s*|chapter\s+)(\d{1,2})\.?\s*[:\.\-\s]+(.+)$",
    re.I,
)


def extract_toc_from_chapter_markers(full_text: str) -> list[dict[str, Any]]:
    """
    Scan the FULL document for Ch. N / Chapter N markers.
    Merges multi-line headings (marker on one line, title on the next).
    Uses sequence inference: numbering 1..N is authoritative ordering.
    """
    if not full_text.strip():
        return []

    lines = full_text.splitlines()
    entries: list[tuple[int, str]] = []
    seen_nums: set[int] = set()

    i = 0
    while i < len(lines):
        stripped = re.sub(r"\s+", " ", lines[i].strip())
        if not stripped:
            i += 1
            continue

        m_inline = _CHAPTER_MARKER_INLINE.match(stripped)
        if m_inline:
            num = int(m_inline.group(1))
            title = _strip_page_number(m_inline.group(2).strip())
            if 3 <= len(title) <= 120 and num not in seen_nums:
                seen_nums.add(num)
                entries.append((num, title))
            i += 1
            continue

        m_only = _CHAPTER_MARKER_ONLY.match(stripped)
        if m_only and i + 1 < len(lines):
            num = int(m_only.group(1))
            nxt = re.sub(r"\s+", " ", lines[i + 1].strip())
            if (
                5 <= len(nxt) <= 120
                and nxt[0].isupper()
                and not _CHAPTER_MARKER_ONLY.match(nxt)
                and not _CHAPTER_MARKER_INLINE.match(nxt)
                and not _NOISE_LINE.match(nxt)
                and num not in seen_nums
            ):
                seen_nums.add(num)
                entries.append((num, nxt))
                i += 2
                continue

        i += 1

    if len(entries) < 3:
        return []

    entries.sort(key=lambda x: x[0])
    if entries[0][0] != 1:
        return []

    return [_chapter_dict(title, num - 1) for num, title in entries[:60]]


def extract_toc_from_body_headings(full_text: str) -> list[dict[str, Any]]:
    """
    Scan the FULL document for section titles on blank-line boundaries.
    Works for blog compilations / memoirs without a formal TOC page.
    """
    if not full_text.strip():
        return []

    lines = full_text.splitlines()
    found: list[tuple[int, str]] = []
    seen: set[str] = set()

    for i, line in enumerate(lines):
        stripped = re.sub(r"\s+", " ", line.strip())
        if len(stripped) < 6 or len(stripped) > 100:
            continue
        if _NOISE_LINE.match(stripped):
            continue
        if not stripped[0].isupper():
            continue
        if stripped.endswith(".") and len(stripped.split()) > 10:
            continue
        if re.fullmatch(r"[\d\s\W]+", stripped):
            continue

        prev_blank = i == 0 or not lines[i - 1].strip()
        next_blank = i + 1 >= len(lines) or not lines[i + 1].strip()
        if not (prev_blank and next_blank):
            continue

        words = stripped.split()
        if len(words) < 2:
            continue

        key = stripped.lower()
        if key in seen:
            continue
        seen.add(key)
        pos = full_text.find(stripped)
        if pos == -1:
            pos = i
        found.append((pos, stripped))

    found.sort(key=lambda x: x[0])
    if len(found) < 5:
        return []

    # Trim obvious front-matter noise: keep from first entry that looks like a real section
    trimmed = found
    if len(found) > 8:
        trimmed = found[1:] if len(found[0][1]) < 20 else found

    if len(trimmed) > 35:
        trimmed = trimmed[:35]

    return [_chapter_dict(title, i) for i, (_, title) in enumerate(trimmed)]


def _structural_toc_candidates(
    pdf_bytes: bytes,
    text: str,
) -> tuple[list[dict[str, Any]], str]:
    """Best non-AI TOC from chapter markers, numbered lists, contents, body headings, bookmarks."""
    candidates: list[tuple[list[dict[str, Any]], str]] = []
    markers = extract_toc_from_chapter_markers(text)
    numbered = extract_toc_from_numbered_list(text)
    toc_text = extract_toc_from_text(text)
    body = extract_toc_from_body_headings(text)
    headings = extract_toc_from_headings(text)
    bookmarks = extract_toc_from_bookmarks(pdf_bytes)

    if markers:
        candidates.append((markers, "chapter_markers"))
    if numbered:
        candidates.append((numbered, "numbered_list"))
    if toc_text:
        candidates.append((toc_text, "toc_text"))
    if body:
        candidates.append((body, "body_headings"))
    if headings:
        candidates.append((headings, "headings"))
    if bookmarks:
        candidates.append((bookmarks, "bookmarks"))

    return _pick_best_toc(candidates)


_HEADING_PATTERNS = [
    re.compile(r"^(?:chapter|ch\.?)\s+(\d+|[IVXLC]+)\s*[:\.\-\s]+(.+)$", re.I),
    re.compile(r"^(\d+(?:\.\d+)*)\s+([A-Z][\w\s\-:,]{4,80})$"),
]


def extract_toc_from_headings(full_text: str) -> list[dict[str, Any]]:
    """Detect chapter-like headings from document body text without AI."""
    if not full_text.strip():
        return []
    lines = full_text.splitlines()
    found: list[dict[str, Any]] = []
    seen: set[str] = set()
    for line in lines[:8000]:
        stripped = re.sub(r"\s+", " ", line.strip())
        if len(stripped) < 4 or len(stripped) > 120:
            continue
        for pat in _HEADING_PATTERNS:
            m = pat.match(stripped)
            if not m:
                continue
            title = m.group(m.lastindex) if m.lastindex else stripped
            title = str(title).strip()
            key = title.lower()
            if key in seen or len(title) < 4:
                continue
            seen.add(key)
            found.append(_chapter_dict(title, len(found)))
            break
        if len(found) >= 40:
            break
    return found if len(found) >= 3 else []


def extract_toc_with_ai(
    full_text: str,
    *,
    title: str,
    author: str,
    description: str | None = None,
    candidate_titles: list[str] | None = None,
) -> list[dict[str, Any]]:
    """Primary TOC extraction — AI reads a rich sample built from the full PDF text."""
    sample = toc_sample_text(full_text)
    desc = f"\nDescription: {description}" if description else ""
    candidates_block = ""
    if candidate_titles:
        listed = "\n".join(f"  {i + 1}. {t}" for i, t in enumerate(candidate_titles[:40]))
        candidates_block = (
            f"\n\nSECTION TITLES DETECTED BY SCANNING THE FULL PDF ({len(candidate_titles)} found):\n"
            f"{listed}\n\n"
            "You MUST return ALL of these as chapters in order (fix numbering/titles only if clearly wrong).\n"
        )

    client = get_anthropic_client()
    message = client.messages.create(
        model=CLAUDE_SONNET_MODEL,
        max_tokens=8192,
        system=TOC_SYSTEM,
        messages=[
            {
                "role": "user",
                "content": (
                    f'Extract the COMPLETE table of contents for "{title}" by {author}.{desc}'
                    f"{candidates_block}\n\n"
                    f"PDF TEXT (table of contents, document start, end, and headings from the full PDF):\n"
                    f"{sample}\n\n"
                    "Return ONLY JSON with every major section/chapter/essay in order. "
                    "Typical books have many sections — do not stop after 1-2. Copy titles from the PDF text."
                ),
            },
        ],
    )
    raw = "".join(b.text for b in message.content if hasattr(b, "text"))
    data = parse_model_json(raw)
    return _normalize_chapters(data.get("chapters") or [])


def _heuristic_toc(
    pdf_bytes: bytes,
    text: str,
) -> tuple[list[dict[str, Any]], str]:
    """Non-AI fallbacks when Claude is unavailable or returns nothing."""
    return _structural_toc_candidates(pdf_bytes, text)


def extract_toc_from_pdf_bytes(
    pdf_bytes: bytes,
    *,
    title: str,
    author: str,
    description: str | None = None,
    full_text: str | None = None,
) -> tuple[list[dict[str, Any]], str, str | None]:
    """
    Extract TOC — AI first (reads full PDF text via rich sample), heuristics as fallback.
    Returns (chapters, method_used, ai_error).
    """
    text = full_text if full_text is not None else extract_pdf_text(pdf_bytes)
    if not text.strip():
        log.warning("toc_extract_empty_pdf", extra={"title": title})
        return [], "empty", None

    try:
        from presentation_pdf import extract_slides_as_chapters, is_presentation_pdf

        if is_presentation_pdf(pdf_bytes):
            slides = extract_slides_as_chapters(pdf_bytes)
            if len(slides) >= 2:
                aligned = _align_chapter_titles(slides, text)
                log.info(
                    "toc_presentation_slides",
                    extra={"title": title, "slides": len(aligned)},
                )
                return aligned, "presentation_slides", None
    except Exception as exc:
        log.warning("presentation_pdf_detect_failed", extra={"error": str(exc), "title": title})

    structural, structural_method = _structural_toc_candidates(pdf_bytes, text)
    structural_titles = [str(c.get("title", "")).strip() for c in structural if c.get("title")]

    chapters: list[dict[str, Any]] = []
    method = "ai"
    ai_error: str | None = None

    try:
        chapters = extract_toc_with_ai(
            text,
            title=title,
            author=author,
            description=description,
            candidate_titles=structural_titles or None,
        )
    except Exception as exc:
        ai_error = str(exc)
        log.warning("ai_toc_failed", extra={"error": ai_error, "title": title})
        method = "fallback"

    # AI often returns only 1-2 sections for blog-style books — prefer full-document scan when it finds more.
    if len(structural) >= 3 and len(structural) > len(chapters):
        log.info(
            "toc_using_structural_over_ai",
            extra={"structural": len(structural), "ai": len(chapters), "method": structural_method},
        )
        chapters = structural
        method = structural_method
    elif not chapters and structural:
        chapters = structural
        method = structural_method

    if not chapters:
        chapters, method = _heuristic_toc(pdf_bytes, text)

    if not chapters:
        segments = build_content_map(text, None)
        chapters = [
            {"chapter_number": i + 1, "title": seg.title, "subtopics": []}
            for i, seg in enumerate(segments)
        ]
        method = "content_map"

    # Long documents with very few sections usually mean AI was unavailable — don't silently accept.
    if ai_error and len(text) > 30_000 and len(chapters) < 6:
        raise RuntimeError(
            "AI chapter extraction failed on the worker. Set ANTHROPIC_API_KEY on the worker "
            f"service (Railway/production). Fallback found only {len(chapters)} sections. "
            f"Detail: {ai_error[:200]}"
        )

    aligned = _align_chapter_titles(chapters, text)
    log.info(
        "toc_extracted",
        extra={"title": title, "method": method, "chapters": len(aligned), "ai_error": ai_error},
    )
    return aligned, method, ai_error
