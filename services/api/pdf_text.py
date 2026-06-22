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


# Minimum average extractable characters per page for a text-based PDF.
_MIN_CHARS_PER_PAGE = 40
# Absolute floor — very short docs may be valid.
_MIN_TOTAL_TEXT_CHARS = 80

# Pages to scan for image-only detection (full book is not needed).
_MAX_IMAGE_CHECK_PAGES = 12

IMAGE_ONLY_PDF_MESSAGE = (
    "This PDF looks like a scanned photo or image-only document. "
    "MindFlip cannot process image PDFs yet — please upload a text-based PDF "
    "(for example, exported from Word, Google Docs, or a digital textbook)."
)


def pdf_is_likely_image_only(data: bytes, *, max_pages: int = _MAX_IMAGE_CHECK_PAGES) -> bool:
    """
    Heuristic: PDFs that are photos/scans have little or no extractable text.
    Only samples the first few pages — sufficient for upload validation.
    """
    try:
        reader = PdfReader(BytesIO(data))
    except Exception:
        return True

    pages = reader.pages
    if not pages:
        return True

    sample = pages[: max(1, min(max_pages, len(pages)))]
    total_chars = 0
    sparse_pages = 0
    for i, page in enumerate(sample):
        try:
            text = (page.extract_text() or "").strip()
        except Exception:
            text = ""
        char_count = len(text)
        total_chars += char_count
        if char_count < _MIN_CHARS_PER_PAGE:
            sparse_pages += 1
        # Clearly text-based after a couple of pages — skip scanning the rest.
        if i >= 1 and total_chars >= 400:
            return False

    if total_chars < _MIN_TOTAL_TEXT_CHARS:
        return True

    avg_chars = total_chars / len(sample)
    if avg_chars < _MIN_CHARS_PER_PAGE:
        return True

    if sparse_pages >= max(1, int(len(sample) * 0.85)):
        return True

    return False


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
