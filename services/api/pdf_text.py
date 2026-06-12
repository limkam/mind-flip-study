"""Shared PDF text extraction."""

from __future__ import annotations

import re
from io import BytesIO

from pypdf import PdfReader

TOC_SAMPLE_CHARS = 100_000
TOC_SAMPLE_MAX = 120_000

_HEADING_LINE = re.compile(
    r"^(?:\d+\.?\s+|(?:chapter|ch\.?|section|appendix|part)\s+)",
    re.I,
)


def extract_pdf_text(data: bytes, *, max_pages: int | None = None) -> str:
    reader = PdfReader(BytesIO(data))
    parts: list[str] = []
    pages = reader.pages if max_pages is None else reader.pages[:max_pages]
    for page in pages:
        try:
            t = page.extract_text() or ""
        except Exception:
            t = ""
        if t:
            parts.append(t)
    return "\n".join(parts)


def _collect_heading_lines(full_text: str, *, limit: int = 300) -> list[str]:
    """Scan the full document for section-heading lines to give AI document-wide structure."""
    found: list[str] = []
    seen: set[str] = set()
    for line in full_text.splitlines():
        stripped = re.sub(r"\s+", " ", line.strip())
        if len(stripped) < 4 or len(stripped) > 150:
            continue
        if not _HEADING_LINE.match(stripped):
            continue
        key = stripped.lower()
        if key in seen:
            continue
        seen.add(key)
        found.append(stripped[:150])
        if len(found) >= limit:
            break
    return found


def toc_sample_text(full_text: str) -> str:
    """
    Build a rich excerpt for AI TOC extraction:
    - Table of contents region (or document start)
    - End-of-document sample (appendix/references)
    - Section headings scanned from the full PDF text
    """
    text = full_text.strip()
    if not text:
        return ""

    lower = text.lower()
    toc_markers = ("table of contents", "\ncontents\n", "\ncontents \n", "contents\n")
    toc_start = -1
    for marker in toc_markers:
        idx = lower.find(marker)
        if idx != -1 and (toc_start == -1 or idx < toc_start):
            toc_start = idx

    parts: list[str] = []
    if toc_start != -1:
        parts.append(text[toc_start : toc_start + TOC_SAMPLE_CHARS])
    else:
        parts.append(text[:TOC_SAMPLE_CHARS])

    if len(text) > TOC_SAMPLE_CHARS:
        parts.append(f"\n\n--- DOCUMENT END SAMPLE ---\n{text[-20_000:]}")

    headings = _collect_heading_lines(text)
    if headings:
        parts.append("\n\n--- SECTION HEADINGS SCANNED FROM FULL DOCUMENT ---\n")
        parts.append("\n".join(headings))

    combined = "".join(parts)
    if len(combined) > TOC_SAMPLE_MAX:
        return combined[:TOC_SAMPLE_MAX]
    return combined
