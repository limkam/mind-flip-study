"""Extract and align table of contents from uploaded PDFs."""

from __future__ import annotations

import logging
import re
import time
from io import BytesIO
from typing import Any
from uuid import UUID

from pypdf import PdfReader

from ai_generation import parse_model_json
from anthropic_client import CLAUDE_SONNET_MODEL, get_anthropic_client
from token_usage_log import log_failed_ai_request, log_token_usage
from content_map import _find_title_pos, build_content_map
from pdf_text import extract_document_text, extract_pdf_text, toc_sample_text

log = logging.getLogger(__name__)

TOC_SYSTEM = """You are analyzing a book to produce its table of contents (TOC).

INPUT: The full document text, chunked with [PAGE n] markers.

STEP 1 — DETECT
Check the front matter (typically within the first 5-8% of pages) for an existing, author-provided table of contents — a list of chapter/section titles, usually with page numbers.

- If you are uncertain whether something is a real TOC (for example, themes listed in a preface or a marketing blurb), treat it as NOT found. Do not guess.
- Ignore running headers/footers, copyright pages, dedication pages, and epigraphs. None of these count as a TOC.

STEP 2A — IF A TOC EXISTS
Extract it verbatim into structured JSON.
- Preserve the original hierarchy (parts, chapters, subsections) using indentation, numbering style, or heading-level cues from the source.
- Include page numbers exactly as printed. If a page number is missing for an entry, set "page": null. Never infer or calculate one.
- Do NOT invent titles, merge entries, reword, or clean up anything. Copy exactly what is printed, including quirks like "Ch. 3" versus "Chapter Three".

STEP 2B — IF NO TOC EXISTS, GENERATE ONE
Scan the ENTIRE document, not just front matter, for structural divisions:
- Explicit markers: "Chapter 1", "Part Two", "Section 3.4", roman numerals, and similar labels.
- Formatting cues: headings that are short, consistently styled, followed by a page break, or clearly separated from body text.
- Consistent numbering sequences, including unlabeled numbers standing alone before chapter opening text.

Rules for accuracy:
- Use the EXACT heading text as it appears in the source. Do not summarize, rename, translate, or invent a title for an unnamed section. If a chapter genuinely has only a number, use only that number as its title.
- Do not fabricate structure. Preserve only levels supported by the document.
- For generated entries, use the exact [PAGE n] marker where the heading physically occurs. Never fabricate a page number.
- Exclude uncertain candidate headings rather than include a false entry.
- If the document has no discernible structural breaks, return an empty entries array.

OUTPUT FORMAT (strict JSON, no commentary):
{
  "toc_found": true | false,
  "entries": [
    {"level": 1, "title": "string", "page": number | null},
    {"level": 2, "title": "string", "page": number | null}
  ]
}

RULES:
- Set "toc_found" to true only when an author-provided TOC exists. Set it to false when entries were derived from document headings.
- Return strict JSON only, with no markdown or commentary."""

_NOISE_LINE = re.compile(
    r"^(page \d|copyright|©|all rights|www\.|http|isbn|table of contents|\d+$|bilkeys)",
    re.I,
)

_SUBSECTION_LINE_RE = re.compile(r"^\d+\.\d+(?:\.\d+)?(?:\s|$)")
_SUBSECTION_TITLE_RE = re.compile(r"^(?:chapter\s+)?\d+\.\d+", re.I)
_CONTENTS_HEADING_RE = re.compile(r"^\s*(?:table\s+of\s+contents|contents)\s*:?[\s.]*$", re.I)


def _contents_heading_index(lines: list[str], *, front_fraction: float = 0.08) -> int | None:
    """Return a verified standalone TOC heading in the document front matter."""
    if not lines:
        return None
    front_limit = max(40, min(1500, int(len(lines) * front_fraction) + 1))
    for index, line in enumerate(lines[:front_limit]):
        if _CONTENTS_HEADING_RE.fullmatch(line.strip()):
            return index
    return None


def _has_contents_page(full_text: str) -> bool:
    """True when the PDF text includes a table-of-contents region."""
    return _contents_heading_index(full_text.splitlines()) is not None


def _is_subsection_title(title: str) -> bool:
    stripped = title.strip()
    if not stripped:
        return True
    if _SUBSECTION_TITLE_RE.match(stripped):
        return True
    if re.match(r"^\d+\.\d+\s", stripped):
        return True
    return False


def _strip_page_number(title: str) -> str:
    """Remove TOC leader dots and trailing page numbers from a title."""
    text = title.strip()
    text = re.sub(r"\s*[.\·\u2024\s]{2,}\s*\d+\s*$", "", text).strip()
    # Inline page refs like "Sets 22" — but keep titles such as "Topic Number 1".
    m = re.search(r"^(.+?)\s+(\d{1,4})$", text)
    if not m:
        return text
    prefix, tail_num = m.group(1).strip(), int(m.group(2))
    if re.search(r"(?:number|chapter|ch|part|vol|no\.?|#)\s*$", prefix, re.I):
        return text
    if tail_num >= 10 or len(prefix.split()) >= 2:
        return prefix
    return text


def _sequential_main_chapters(numbered: list[tuple[int, str]]) -> list[dict[str, Any]] | None:
    """
    Keep chapters numbered 1, 2, 3… without gaps (drops stray page numbers like 22, 99).
  """
    by_num: dict[int, str] = {}
    for num, raw_title in numbered:
        if num < 1 or num > 200:
            continue
        title = _strip_page_number(raw_title)
        if len(title) < 2 or _is_subsection_title(title):
            continue
        if num not in by_num:
            by_num[num] = title

    if 1 not in by_num:
        return None

    end = 1
    while (end + 1) in by_num:
        end += 1
    if end < 2:
        return None

    return [
        {"chapter_number": i, "title": by_num[i], "subtopics": []}
        for i in range(1, end + 1)
    ]


def _finalize_numbered_main_chapters(chapters: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Prefer a clean 1..N main-chapter sequence when TOC lines are numbered."""
    numbered: list[tuple[int, str]] = []
    for ch in chapters:
        toc_num = ch.get("_toc_num")
        title = _strip_page_number(str(ch.get("title", "")))
        if not title:
            continue
        if toc_num is not None:
            try:
                numbered.append((int(toc_num), title))
                continue
            except (TypeError, ValueError):
                pass
        lead = re.match(r"^(\d{1,2})\s+(.+)$", title)
        if lead and not re.match(r"^\d+\.\d+", title):
            numbered.append((int(lead.group(1)), _strip_page_number(lead.group(2))))

    seq = _sequential_main_chapters(numbered)
    if seq:
        return seq

    out: list[dict[str, Any]] = []
    for ch in chapters:
        title = _strip_page_number(str(ch.get("title", "")))
        if not title or _is_subsection_title(title):
            continue
        out.append({"chapter_number": len(out) + 1, "title": title, "subtopics": []})
    return out


def _strip_to_main_chapters(chapters: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Keep only top-level chapters; drop subsections and clear subtopics."""
    return _finalize_numbered_main_chapters(chapters)


def _normalize_chapters(raw: list[Any]) -> list[dict[str, Any]]:
    chapters: list[dict[str, Any]] = []
    for i, item in enumerate(raw):
        if not isinstance(item, dict):
            continue
        title = _strip_page_number(str(item.get("title", "")).strip())
        if not title:
            continue
        num = item.get("chapter_number")
        try:
            chapter_number = int(num) if num is not None else i + 1
        except (TypeError, ValueError):
            chapter_number = i + 1
        chapters.append(
            {
                "chapter_number": chapter_number,
                "title": title,
                "subtopics": [],
            },
        )
    return chapters


def _chapter_dict(
    title: str,
    index: int,
    subtopics: list[str] | None = None,
    *,
    toc_num: int | None = None,
) -> dict[str, Any]:
    subs = [s for s in (subtopics or []) if s and str(s).strip()]
    entry: dict[str, Any] = {
        "chapter_number": index + 1,
        "title": _strip_page_number(title),
        "subtopics": subs,
    }
    if toc_num is not None:
        entry["_toc_num"] = toc_num
    return entry


_CONTAINER_TITLE_RE = re.compile(
    r"^(?:part|book|volume|vol\.?|section|unit)\s+([IVXLC]+|\d+)\b",
    re.I,
)


def _outline_children(item: Any) -> list[Any]:
    try:
        return list(getattr(item, "children", None) or [])
    except Exception:
        return []


def _outline_to_tree(items: list[Any]) -> list[dict[str, Any]]:
    """Convert PDF outline to a simple title/children tree."""
    nodes: list[dict[str, Any]] = []
    for item in items or []:
        if isinstance(item, list):
            nodes.extend(_outline_to_tree(item))
            continue
        try:
            title = str(getattr(item, "title", "") or "").strip()
        except Exception:
            title = ""
        if not title or len(title) < 2:
            continue
        nodes.append({"title": title, "children": _outline_to_tree(_outline_children(item))})
    return nodes


def _tree_to_chapters(nodes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Map bookmark hierarchy to main chapters only (no subtopics)."""
    chapters: list[dict[str, Any]] = []

    def append_chapter(title: str) -> None:
        title = title.strip()
        if len(title) < 2 or _is_subsection_title(title):
            return
        chapters.append(_chapter_dict(title, len(chapters)))

    for node in nodes:
        title = node["title"]
        children = node["children"]

        if not children:
            append_chapter(title)
            continue

        if _CONTAINER_TITLE_RE.match(title):
            for child in children:
                append_chapter(child["title"])
            continue

        append_chapter(title)

    return chapters[:80]


def _score_chapter_list(chapters: list[dict[str, Any]]) -> tuple[int, int, int]:
    """Higher is better: (count, chapter_like_titles, -part_like_titles)."""
    chapter_re = re.compile(r"^(?:chapter|ch\.?|unit|lesson)\s+(\d+|[IVXLC]+)\b", re.I)
    part_re = re.compile(r"^part\s+([IVXLC]+|\d+)\b", re.I)
    titles = [str(c.get("title", "")).strip() for c in chapters]
    chapter_like = sum(1 for t in titles if chapter_re.match(t))
    part_like = sum(1 for t in titles if part_re.match(t))
    return (len(chapters), chapter_like, -part_like)


def _sequential_chapter_score(chapters: list[dict[str, Any]]) -> int:
    """Higher when chapters form a clean 1..N main sequence."""
    numbered: list[tuple[int, str]] = []
    for ch in chapters:
        toc_num = ch.get("_toc_num")
        title = str(ch.get("title", ""))
        if toc_num is not None:
            try:
                numbered.append((int(toc_num), title))
                continue
            except (TypeError, ValueError):
                pass
        lead = re.match(r"^(\d{1,2})\s+(.+)$", title)
        if lead:
            numbered.append((int(lead.group(1)), lead.group(2)))
    seq = _sequential_main_chapters(numbered)
    return len(seq) if seq else 0


def _pick_best_toc(candidates: list[tuple[list[dict[str, Any]], str]]) -> tuple[list[dict[str, Any]], str]:
    valid = [(ch, method) for ch, method in candidates if len(ch) >= 2]
    if not valid:
        return [], "none"
    valid.sort(
        key=lambda item: (
            _sequential_chapter_score(item[0]),
            _toc_richness(item[0]),
            len(item[0]),
            _score_chapter_list(item[0]),
        ),
        reverse=True,
    )
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
        aligned.append({**ch, "title": _strip_page_number(title)})
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


def _chapters_from_flat_outline(flat: list[tuple[str, int]]) -> list[dict[str, Any]]:
    """Build main chapters from outline depth (ignore nested subsections)."""
    if not flat:
        return []
    min_depth = min(depth for _, depth in flat)
    chapters: list[dict[str, Any]] = []

    for title, depth in flat:
        rel = depth - min_depth
        if len(title) < 2:
            continue
        if _CONTAINER_TITLE_RE.match(title):
            continue
        if rel <= 1 and not _is_subsection_title(title):
            chapters.append(_chapter_dict(title, len(chapters)))

    if len(chapters) >= 2:
        return chapters[:80]
    return []


def extract_toc_from_bookmarks(pdf_bytes: bytes) -> list[dict[str, Any]]:
    """Use PDF outline/bookmarks — main chapters only."""
    chapter_re = re.compile(r"^(?:chapter|ch\.?|unit|lesson)\s+(\d+|[IVXLC]+)\b", re.I)
    try:
        reader = PdfReader(BytesIO(pdf_bytes))
        outline = reader.outline
        if not outline:
            return []

        flat = _flatten_outline(list(outline))
        from_flat = _chapters_from_flat_outline(flat)
        if len(from_flat) >= 2:
            return from_flat

        tree = _outline_to_tree(list(outline))
        hierarchical = _tree_to_chapters(tree)
        if len(hierarchical) >= 2:
            return hierarchical

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

        chapter_like = [t for t, _ in flat if chapter_re.match(t) and not _is_subsection_title(t)]
        if len(chapter_like) >= 2 and len(chapter_like) > len(best_titles):
            best_titles = chapter_like

        if len(best_titles) < 2:
            best_titles = [t for t, _ in flat if len(t) >= 3 and not _is_subsection_title(t)]

        if len(best_titles) < 2:
            return []

        return [_chapter_dict(title, i) for i, title in enumerate(best_titles[:80])]
    except Exception as exc:
        log.debug("bookmark_toc_failed", extra={"error": str(exc)})
        return []


_TOC_ENTRY_PATTERNS = [
    re.compile(
        r"^(?:chapter|ch\.?)\s*(\d+|[IVXLC]+)\s*[:\.\-\s]+(.+?)(?:\s*[.\·\u2024\s]{2,}\s*\d+\s*)?$",
        re.I,
    ),
    re.compile(r"^(\d{1,2})\.(?!\d)\s+(.+?)(?:\s*[.\·\u2024\s]{2,}\s*\d+\s*)?$"),
    re.compile(r"^(\d{1,2})\s+([A-Z].+?)(?:\s*[.\·\u2024\s]{2,}\s*\d+\s*)?$"),
    re.compile(
        r"^(?:section|sec\.?)\s+(\d+|[IVXLC]+)\s*[:\.\-\s]+(.+?)(?:\s*[.\·\u2024\s]{2,}\s*\d+\s*)?$",
        re.I,
    ),
]

_TOC_END_MARKERS = re.compile(r"^(index|appendix|bibliography|references|preface|foreword)\b", re.I)


def _toc_richness(chapters: list[dict[str, Any]]) -> int:
    """Higher = more main chapters (subsections are not counted)."""
    return len(chapters) * 10


def extract_toc_from_text(full_text: str) -> list[dict[str, Any]]:
    """Parse the table-of-contents pages from extracted PDF text."""
    if not full_text.strip():
        return []

    lines = full_text.splitlines()
    start = _contents_heading_index(lines)
    if start is None:
        return []

    search_end = min(len(lines), start + 1200)

    found: list[dict[str, Any]] = []
    seen: set[str] = set()
    blank_run = 0

    for line in lines[start:search_end]:
        stripped = re.sub(r"\s+", " ", line.strip())
        if not stripped:
            blank_run += 1
            # Only stop after a long blank gap once we already parsed a real TOC block.
            if blank_run >= 30 and len(found) >= 3:
                break
            continue
        blank_run = 0

        if _TOC_END_MARKERS.match(stripped) and len(found) >= 5:
            break

        # Stray page-number lines in messy PDF text (e.g. "22" on its own).
        if re.fullmatch(r"\d{1,4}", stripped):
            continue

        # Skip subsections (1.1, 2.3, etc.) — main chapters only.
        if _SUBSECTION_LINE_RE.match(stripped):
            continue

        for pat_idx, pat in enumerate(_TOC_ENTRY_PATTERNS):
            m = pat.match(stripped)
            if not m:
                continue
            toc_num: int | None = None
            if pat_idx in (1, 2):
                toc_num = int(m.group(1))
            elif pat_idx == 0 and str(m.group(1)).isdigit():
                toc_num = int(m.group(1))
            title = _strip_page_number(m.group(m.lastindex or 2))
            if len(title) < 3 or len(title) > 120 or _is_subsection_title(title):
                continue
            key = title.lower()
            if key in seen:
                break
            seen.add(key)
            found.append(_chapter_dict(title, len(found), toc_num=toc_num))
            break

        if len(found) >= 80:
            break

    if len(found) >= 2:
        return _finalize_numbered_main_chapters(found)
    return []


_NUMBERED_LIST_LINE = re.compile(
    r"^(\d{1,2})\s+(.{5,100}?)(?:\s*[.\·\u2024\s]{2,}\s*\d+\s*)?$",
)


def extract_toc_from_numbered_list(full_text: str) -> list[dict[str, Any]]:
    """Parse numbered TOC lines like '1 Who's Frying Baloney?' (blog-style, no 'Chapter' prefix)."""
    if not full_text.strip():
        return []

    lines = full_text.splitlines()
    start = _contents_heading_index(lines)
    if start is None:
        return []

    search_end = min(len(lines), start + 800)

    entries: list[tuple[int, str]] = []
    seen: set[str] = set()
    for line in lines[start:search_end]:
        stripped = re.sub(r"\s+", " ", line.strip())
        if _SUBSECTION_LINE_RE.match(stripped):
            continue
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

    chapters = [_chapter_dict(title, i, toc_num=num) for i, (num, title) in enumerate(entries[:80])]
    if _has_contents_page(full_text):
        return _finalize_numbered_main_chapters(chapters)
    return chapters


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

    return [_chapter_dict(title, num - 1) for num, title in entries[:80]]


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

    if len(trimmed) > 60:
        trimmed = trimmed[:60]

    return [_chapter_dict(title, i) for i, (_, title) in enumerate(trimmed)]


def _structural_toc_candidates(
    pdf_bytes: bytes,
    text: str,
) -> tuple[list[dict[str, Any]], str]:
    """Best non-AI TOC from chapter markers, numbered lists, contents, body headings, bookmarks."""
    has_contents = _has_contents_page(text)
    candidates: list[tuple[list[dict[str, Any]], str]] = []
    markers = extract_toc_from_chapter_markers(text)
    numbered = extract_toc_from_numbered_list(text)
    toc_text = extract_toc_from_text(text)
    body = extract_toc_from_body_headings(text) if not has_contents else []
    headings = extract_toc_from_headings(text) if not has_contents else []
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
    re.compile(r"^(\d{1,2})\s+([A-Z][\w\s\-:,]{4,80})$"),
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
        if _SUBSECTION_LINE_RE.match(stripped):
            continue
        for pat in _HEADING_PATTERNS:
            m = pat.match(stripped)
            if not m:
                continue
            title = m.group(m.lastindex) if m.lastindex else stripped
            title = str(title).strip()
            if _is_subsection_title(title):
                continue
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
    main_chapters_only: bool = False,
    user_id: UUID | str | None = None,
    book_id: UUID | str | None = None,
    celery_task_id: str | None = None,
) -> list[dict[str, Any]]:
    """Primary TOC extraction — AI reads a rich sample built from the full PDF text."""
    sample = toc_sample_text(full_text)
    desc = f"\nDescription: {description}" if description else ""
    client = get_anthropic_client()
    started = time.perf_counter()
    try:
        message = client.messages.create(
            model=CLAUDE_SONNET_MODEL,
            max_tokens=8192,
            system=TOC_SYSTEM,
            messages=[
            {
                "role": "user",
                "content": (
                    f'Book: "{title}" by {author}.{desc}\n\n'
                    "INPUT: Full document text with page markers.\n\n"
                    f"{sample}"
                ),
            },
            ],
        )
    except Exception as exc:
        if user_id is not None:
            log_failed_ai_request(task="extract_toc", user_id=user_id, model=CLAUDE_SONNET_MODEL,
                                  duration_ms=int((time.perf_counter() - started) * 1000), error=exc,
                                  book_id=book_id, celery_task_id=celery_task_id)
        raise
    if user_id is not None:
        usage = message.usage
        log_token_usage(task="extract_toc", user_id=user_id, model=CLAUDE_SONNET_MODEL,
                        input_tokens=int(getattr(usage, "input_tokens", 0) or 0),
                        output_tokens=int(getattr(usage, "output_tokens", 0) or 0),
                        cache_read_tokens=int(getattr(usage, "cache_read_input_tokens", 0) or 0),
                        cache_creation_tokens=int(getattr(usage, "cache_creation_input_tokens", 0) or 0),
                        cached_tokens=int(getattr(usage, "cache_read_input_tokens", 0) or 0) + int(getattr(usage, "cache_creation_input_tokens", 0) or 0),
                        duration_ms=int((time.perf_counter() - started) * 1000), book_id=book_id,
                        celery_task_id=celery_task_id,
                        call_metadata={"provider_request_id": getattr(message, "id", None)})
    raw = "".join(b.text for b in message.content if hasattr(b, "text"))
    data = parse_model_json(raw)
    entries = data.get("entries")
    if not isinstance(entries, list):
        return []

    authored_toc = data.get("toc_found") is True

    chapters: list[dict[str, Any]] = []
    for item in entries:
        if not isinstance(item, dict):
            continue
        title_text = str(item.get("title") or "").strip()
        if not title_text:
            continue
        try:
            level = max(1, int(item.get("level", 1)))
        except (TypeError, ValueError):
            level = 1
        page = item.get("page")
        if not isinstance(page, int) or isinstance(page, bool):
            page = None
        chapters.append(
            {
                "chapter_number": len(chapters) + 1,
                "title": title_text,
                "subtopics": [],
                "level": level,
                "page": page,
                "authored_toc": authored_toc,
            },
        )
    return chapters


def _heuristic_toc(
    pdf_bytes: bytes,
    text: str,
) -> tuple[list[dict[str, Any]], str]:
    """Non-AI fallbacks when Claude is unavailable or returns nothing."""
    return _structural_toc_candidates(pdf_bytes, text)


# Methods reliable enough to skip AI when they find a solid chapter list.
_STRONG_STRUCTURAL_METHODS = frozenset({
    "bookmarks",
    "toc_text",
    "numbered_list",
    "chapter_markers",
    "presentation_slides",
})


def _structural_is_reliable(method: str, chapters: list[dict[str, Any]]) -> bool:
    """True when heuristic extraction is trustworthy without AI."""
    if method not in _STRONG_STRUCTURAL_METHODS:
        return False
    if len(chapters) < 5:
        return False
    return True


# Native PDF TOC methods — prefer these over AI when they yield a valid structure.
_NATIVE_TOC_METHODS = frozenset({"bookmarks", "toc_text"})


def _is_native_toc(method: str, chapters: list[dict[str, Any]]) -> bool:
    return method in _NATIVE_TOC_METHODS and len(chapters) >= 2


def _best_native_toc(
    pdf_bytes: bytes,
    text: str,
) -> tuple[list[dict[str, Any]], str]:
    """Return the best native (non-AI) TOC: PDF bookmarks or parsed TOC page."""
    candidates: list[tuple[list[dict[str, Any]], str]] = []
    bookmarks = extract_toc_from_bookmarks(pdf_bytes)
    toc_text = extract_toc_from_text(text)
    if bookmarks:
        candidates.append((bookmarks, "bookmarks"))
    if toc_text:
        candidates.append((toc_text, "toc_text"))
    if not candidates:
        return [], "none"
    candidates.sort(
        key=lambda item: (_toc_richness(item[0]), len(item[0]), _score_chapter_list(item[0])),
        reverse=True,
    )
    return candidates[0]


def extract_toc_from_pdf_bytes(
    pdf_bytes: bytes,
    *,
    title: str,
    author: str,
    description: str | None = None,
    full_text: str | None = None,
    filename: str = "",
    user_id: UUID | str | None = None,
    book_id: UUID | str | None = None,
    celery_task_id: str | None = None,
) -> tuple[list[dict[str, Any]], str, str | None]:
    """
    Extract TOC — prefer document native outline/TOC page; AI only when none found.
    Returns (chapters, method_used, ai_error).
    """
    fn = filename or title
    text = full_text if full_text is not None else extract_document_text(pdf_bytes, filename=fn)
    if not text.strip():
        log.warning("toc_extract_empty_doc", extra={"title": title})
        return [], "empty", None

    has_contents = _has_contents_page(text)
    marked_document_text = extract_document_text(
        pdf_bytes,
        filename=fn,
        include_page_markers=True,
    ) or text[:120_000]

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

    # Prefer native PDF TOC when it is at least as complete as structural heuristics.
    structural, structural_method = _structural_toc_candidates(pdf_bytes, text)
    native, native_method = _best_native_toc(pdf_bytes, text)
    native_ok = (
        _is_native_toc(native_method, native)
        and _toc_richness(native) >= _toc_richness(structural) - 5
        and len(native) >= max(len(structural) - 2, 2)
    )
    if native_ok:
        aligned = _align_chapter_titles(native, text)
        if has_contents:
            aligned = _strip_to_main_chapters(aligned)
        log.info(
            "toc_using_native_pdf",
            extra={"title": title, "method": native_method, "chapters": len(aligned)},
        )
        return aligned, native_method, None

    structural_titles = [str(c.get("title", "")).strip() for c in structural if c.get("title")]

    chapters: list[dict[str, Any]] = []
    method = "ai"
    ai_error: str | None = None
    ai_chapters: list[dict[str, Any]] = []

    if _structural_is_reliable(structural_method, structural):
        chapters = structural
        method = structural_method
        if has_contents:
            chapters = _strip_to_main_chapters(chapters)
        log.info(
            "toc_using_reliable_structural",
            extra={"title": title, "method": structural_method, "chapters": len(chapters)},
        )
    else:
        try:
            ai_chapters = extract_toc_with_ai(
                marked_document_text,
                title=title,
                author=author,
                description=description,
                candidate_titles=structural_titles or None,
                main_chapters_only=has_contents,
                user_id=user_id,
                book_id=book_id,
                celery_task_id=celery_task_id,
            )
        except Exception as exc:
            ai_error = str(exc)
            log.warning("ai_toc_failed", extra={"error": ai_error, "title": title})

        candidates: list[tuple[list[dict[str, Any]], str]] = []
        if ai_chapters:
            ai_method = "ai" if ai_chapters[0].get("authored_toc") is True else "ai_generated"
            candidates.append((ai_chapters, ai_method))
        if structural:
            candidates.append((structural, structural_method))

        if candidates:
            chapters, method = _pick_best_toc(candidates)
            log.info(
                "toc_picked_best",
                extra={
                    "title": title,
                    "method": method,
                    "chapters": len(chapters),
                    "ai_chapters": len(ai_chapters),
                    "structural_chapters": len(structural),
                    "structural_method": structural_method,
                },
            )

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

    # AI-detected TOC entries are already verbatim and carry level/page metadata.
    # Do not rewrite or flatten them after strict extraction.
    aligned = chapters if method.startswith("ai") else _align_chapter_titles(chapters, text)
    if has_contents and not method.startswith("ai"):
        aligned = _strip_to_main_chapters(aligned)
    log.info(
        "toc_extracted",
        extra={"title": title, "method": method, "chapters": len(aligned), "ai_error": ai_error},
    )
    return aligned, method, ai_error
