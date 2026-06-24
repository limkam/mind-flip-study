"""Detect duplicate book uploads by title and PDF content hash."""

from __future__ import annotations

import hashlib
import re
import unicodedata
from collections.abc import Callable
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.book import Book

PDF_SHA256_EXTRAS_KEY = "pdf_sha256"


def pdf_sha256(pdf_bytes: bytes) -> str:
    return hashlib.sha256(pdf_bytes).hexdigest()


def normalize_book_title(title: str) -> str:
    """Lowercase, strip punctuation/extra whitespace for fuzzy title match."""
    text = unicodedata.normalize("NFKD", title.strip().lower())
    text = re.sub(r"[^\w\s]", "", text)
    return re.sub(r"\s+", " ", text).strip()


def _stored_pdf_hash(book: Book) -> str | None:
    ex = book.extras or {}
    raw = ex.get(PDF_SHA256_EXTRAS_KEY)
    if isinstance(raw, str) and len(raw) == 64:
        return raw.lower()
    return None


def _resolve_pdf_hash(
    book: Book,
    *,
    fetch_pdf: Callable[[str, int], bytes] | None,
) -> str | None:
    stored = _stored_pdf_hash(book)
    if stored:
        return stored
    if fetch_pdf is None:
        return None
    try:
        return pdf_sha256(fetch_pdf(book.s3_key, book.file_size_bytes))
    except Exception:
        return None


async def find_duplicate_books(
    db: AsyncSession,
    *,
    user_id: UUID,
    title: str | None = None,
    file_sha256: str | None = None,
    file_size_bytes: int | None = None,
    fetch_pdf: Callable[[str, int], bytes] | None = None,
    exclude_book_id: UUID | None = None,
) -> list[Book]:
    """Return library books matching title and/or the same PDF bytes."""
    normalized_title = normalize_book_title(title) if title else ""
    want_hash = (file_sha256 or "").strip().lower() or None
    result = await db.execute(select(Book).where(Book.user_id == user_id))
    matches: list[Book] = []
    seen_ids: set[UUID] = set()

    for book in result.scalars().all():
        if exclude_book_id is not None and book.id == exclude_book_id:
            continue

        is_match = False

        if normalized_title and title:
            if book.title.strip().lower() == title.strip().lower():
                is_match = True
            elif normalize_book_title(book.title) == normalized_title:
                is_match = True

        if not is_match and want_hash:
            stored = _stored_pdf_hash(book)
            if stored == want_hash:
                is_match = True
            elif (
                fetch_pdf is not None
                and file_size_bytes is not None
                and book.file_size_bytes == file_size_bytes
            ):
                other_hash = _resolve_pdf_hash(book, fetch_pdf=fetch_pdf)
                if other_hash == want_hash:
                    is_match = True

        if is_match and book.id not in seen_ids:
            seen_ids.add(book.id)
            matches.append(book)

    return matches
