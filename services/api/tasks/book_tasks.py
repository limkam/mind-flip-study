"""Celery tasks: on-demand TOC extraction for uploaded books."""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

from sqlalchemy import select

from chapter_content import pdf_text_hash, persist_chapter_segments
from content_map import build_content_map
from database_sync import sync_session
from job_cache import cache_job
from models.book import Book
from models.enums import BookStatus
from pdf_text import extract_pdf_text
from s3_service import get_object_bytes
from tasks.celery_app import celery
from toc_extraction import extract_toc_from_pdf_bytes

log = logging.getLogger(__name__)


def _set_toc_phase(book: Book, phase: str, **extra: Any) -> None:
    extras = dict(book.extras or {})
    proc = dict(extras.get("processing") or {})
    proc["phase"] = phase
    proc["kind"] = "toc_extraction"
    proc.update(extra)
    extras["processing"] = proc
    book.extras = extras


@celery.task(
    bind=True,
    name="tasks.book_tasks.extract_book_toc_task",
    max_retries=3,
    default_retry_delay=20,
)
def extract_book_toc_task(self, book_id: str) -> dict[str, str]:
    """Extract TOC and cache chapter text when the user requests it on book detail."""
    tid = self.request.id
    bid = UUID(book_id)
    cache_job(tid, {"status": "started", "phase": "extracting_contents", "book_id": book_id})

    try:
        with sync_session() as db:
            book = db.execute(select(Book).where(Book.id == bid)).scalar_one_or_none()
            if book is None:
                raise ValueError("Book not found")
            _set_toc_phase(book, "extracting_contents")
            s3_key = book.s3_key
            title = book.title
            author = book.author
            description = (book.extras or {}).get("description")

        pdf_bytes = get_object_bytes(s3_key)
        full_text = extract_pdf_text(pdf_bytes)
        if not full_text.strip():
            raise ValueError("No extractable text from PDF")
        text_hash = pdf_text_hash(full_text)

        cache_job(tid, {"status": "started", "phase": "analyzing_structure", "book_id": book_id})
        with sync_session() as db:
            book = db.execute(select(Book).where(Book.id == bid)).scalar_one()
            _set_toc_phase(book, "analyzing_structure")

        chapters, toc_method, toc_ai_error = extract_toc_from_pdf_bytes(
            pdf_bytes,
            title=title,
            author=author,
            description=description,
            full_text=full_text,
        )
        toc_titles = [str(c.get("title", "")).strip() for c in chapters if c.get("title")]
        if toc_method == "presentation_slides":
            from content_map import ChapterSegment
            from presentation_pdf import build_slide_content_map

            raw_segments = build_slide_content_map(pdf_bytes, chapters)
            segments = [
                ChapterSegment(
                    title=s["title"],
                    text=s["text"],
                    char_count=s["char_count"],
                    index=s["index"],
                )
                for s in raw_segments
            ]
        else:
            segments = build_content_map(full_text, toc_titles or None)

        with sync_session() as db:
            book = db.execute(select(Book).where(Book.id == bid)).scalar_one()
            extras = dict(book.extras or {})
            extras["table_of_contents"] = chapters
            extras["toc_extraction_method"] = toc_method
            if toc_ai_error:
                extras["toc_ai_error"] = toc_ai_error[:500]
            extras = persist_chapter_segments(extras, segments, text_hash=text_hash)
            book.extras = extras
            _set_toc_phase(book, "complete", toc_method=toc_method, chapters=len(chapters))
            book.status = BookStatus.ready

        payload = {
            "status": "complete",
            "phase": "completed",
            "book_id": book_id,
            "chapters": len(chapters),
            "toc_method": toc_method,
        }
        cache_job(tid, payload)
        log.info("book_toc_extraction_complete", extra={"book_id": book_id, "chapters": len(chapters)})
        return payload

    except Exception as exc:
        log.error("book_toc_extraction_failed", extra={"book_id": book_id, "error": str(exc)}, exc_info=True)
        with sync_session() as db:
            book = db.execute(select(Book).where(Book.id == bid)).scalar_one_or_none()
            if book is not None:
                extras = dict(book.extras or {})
                proc = dict(extras.get("processing") or {})
                proc["phase"] = "error"
                proc["kind"] = "toc_extraction"
                proc["error"] = str(exc)[:500]
                extras["processing"] = proc
                book.extras = extras
        cache_job(tid, {"status": "error", "phase": "failed", "book_id": book_id, "error": str(exc)[:500]})
        if int(self.request.retries) >= int(self.max_retries):
            raise
        raise self.retry(exc=exc) from exc
