"""Shared PDF text extraction."""

from __future__ import annotations

from io import BytesIO

from pypdf import PdfReader

TOC_SAMPLE_CHARS = 30_000


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


def toc_sample_text(full_text: str) -> str:
    """Prefer the start of the document (typical TOC) plus a mid-document sample."""
    text = full_text.strip()
    if not text:
        return ""
    head = text[:TOC_SAMPLE_CHARS]
    if len(text) <= TOC_SAMPLE_CHARS * 2:
        return head
    mid_start = len(text) // 3
    mid = text[mid_start : mid_start + 8_000]
    return f"{head}\n\n--- MID DOCUMENT SAMPLE ---\n\n{mid}"
