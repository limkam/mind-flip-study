"""Celery tasks: on-demand TOC extraction for uploaded books."""

from __future__ import annotations

import logging
from pathlib import PurePosixPath
from typing import Any
from uuid import UUID

from sqlalchemy import select

from chapter_content import pdf_text_hash, persist_chapter_segments
from content_map import build_content_map
from document_thumbnail import THUMBNAIL_CONTENT_TYPE, generate_first_page_thumbnail
from database_sync import sync_session
from job_cache import cache_job
from models.book import Book
from models.enums import BookStatus
from pdf_text import extract_document_text
from s3_service import get_object_bytes, put_object_bytes
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


def _persist_first_page_thumbnail(*, book_id: UUID, s3_key: str, doc_bytes: bytes) -> bool:
    thumbnail_key = str(PurePosixPath(s3_key).parent / "thumbnail-first-page.png")
    try:
        thumbnail = generate_first_page_thumbnail(doc_bytes, filename=s3_key)
        put_object_bytes(key=thumbnail_key, data=thumbnail, content_type=THUMBNAIL_CONTENT_TYPE)
        state = {"status": "ready", "s3_key": thumbnail_key, "content_type": THUMBNAIL_CONTENT_TYPE}
        ready = True
    except Exception as exc:
        log.warning("book_thumbnail_generation_failed", extra={"book_id": str(book_id), "error": str(exc)})
        state = {"status": "failed"}
        ready = False
    with sync_session() as db:
        book = db.execute(select(Book).where(Book.id == book_id)).scalar_one_or_none()
        if book is not None:
            extras = dict(book.extras or {})
            extras["thumbnail"] = state
            book.extras = extras
    return ready


@celery.task(name="tasks.book_tasks.generate_book_thumbnail_task")
def generate_book_thumbnail_task(book_id: str) -> dict[str, str]:
    """Backfill a persistent thumbnail without rerunning TOC extraction."""
    bid = UUID(book_id)
    with sync_session() as db:
        book = db.execute(select(Book).where(Book.id == bid)).scalar_one_or_none()
        if book is None:
            return {"status": "missing", "book_id": book_id}
        s3_key = book.s3_key
    ready = _persist_first_page_thumbnail(
        book_id=bid, s3_key=s3_key, doc_bytes=get_object_bytes(s3_key)
    )
    return {"status": "ready" if ready else "failed", "book_id": book_id}


@celery.task(
    bind=True,
    name="tasks.book_tasks.extract_book_toc_task",
    max_retries=3,
    default_retry_delay=20,
)
def extract_book_toc_task(self, book_id: str) -> dict[str, str]:
    """Extract TOC and cache chapter text (auto-started on upload or user retry)."""
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

        doc_bytes = get_object_bytes(s3_key)
        _persist_first_page_thumbnail(book_id=bid, s3_key=s3_key, doc_bytes=doc_bytes)
        full_text = extract_document_text(doc_bytes, filename=s3_key)
        if not full_text.strip():
            raise ValueError("No extractable text from document")
        text_hash = pdf_text_hash(full_text)

        cache_job(tid, {"status": "started", "phase": "analyzing_structure", "book_id": book_id})
        with sync_session() as db:
            book = db.execute(select(Book).where(Book.id == bid)).scalar_one()
            _set_toc_phase(book, "analyzing_structure")

        chapters, toc_method, toc_ai_error = extract_toc_from_pdf_bytes(
            doc_bytes,
            title=title,
            author=author,
            description=description,
            full_text=full_text,
            filename=s3_key,
            user_id=book.user_id,
            book_id=bid,
            celery_task_id=tid,
        )
        toc_titles = [str(c.get("title", "")).strip() for c in chapters if c.get("title")]
        if toc_method == "presentation_slides":
            from content_map import ChapterSegment
            from presentation_pdf import build_slide_content_map

            raw_segments = build_slide_content_map(doc_bytes, chapters)
            # Slide decks don't have meaningful char offsets into `full_text`; cover
            # the deck by sequential slide-chapter index instead (index i occupies
            # unit [i, i+1)), which is contiguous by construction since raw_segments
            # is built with a gap-free running index.
            segments = [
                ChapterSegment(
                    title=s["title"],
                    text=s["text"],
                    char_count=s["char_count"],
                    index=s["index"],
                    start=s["index"],
                    end=s["index"] + 1,
                )
                for s in raw_segments
            ]
        else:
            segments = build_content_map(full_text, toc_titles or None)

        if len(segments) == len(chapters):
            for ch, seg in zip(chapters, segments):
                ch["start_offset"] = seg.start
                ch["end_offset"] = seg.end

        with sync_session() as db:
            book = db.execute(select(Book).where(Book.id == bid)).scalar_one()
            extras = dict(book.extras or {})
            extras["table_of_contents"] = chapters
            extras["toc_extraction_method"] = toc_method
            extras["toc_text_length"] = len(segments) if toc_method == "presentation_slides" else len(full_text)
            if toc_ai_error:
                extras["toc_ai_error"] = toc_ai_error[:500]
            else:
                extras.pop("toc_ai_error", None)
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
        is_final = int(self.request.retries) >= int(self.max_retries)
        if is_final:
            with sync_session() as db:
                book = db.execute(select(Book).where(Book.id == bid)).scalar_one_or_none()
                if book is not None:
                    extras = dict(book.extras or {})
                    proc = dict(extras.get("processing") or {})
                    proc["phase"] = "error"
                    proc["kind"] = "toc_extraction"
                    proc["error"] = str(exc)[:500]
                    proc["job_id"] = tid
                    extras["processing"] = proc
                    book.extras = extras
            cache_job(tid, {"status": "error", "phase": "failed", "book_id": book_id, "error": str(exc)[:500]})
            raise
        raise self.retry(exc=exc) from exc
