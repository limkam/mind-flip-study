"""Celery tasks: download book PDF from S3, extract text, call Anthropic, persist rows."""

from __future__ import annotations

import json
import logging
from io import BytesIO
from typing import Any
from uuid import UUID

import redis
from pypdf import PdfReader
from sqlalchemy import func, select

from ai_generation import (
    celery_job_description,
    find_flashcard_set_for_job,
    find_workbook_for_job,
    mark_book_ai_finished,
    mark_book_ai_processing,
    parse_model_json,
    sections_to_chapters,
    validate_flashcards,
    validate_workbook_content,
)
from anthropic_client import CLAUDE_SONNET_MODEL, get_anthropic_client
from config import settings
from database_sync import sync_session
from models.book import Book
from models.enums import WorkbookStatus
from models.flashcard import Flashcard, FlashcardSet, Workbook
from models.quiz import StudyEvent
from models.user import User
from s3_service import get_object_bytes
from tasks.celery_app import celery
from token_usage_log import log_token_usage

log = logging.getLogger(__name__)

PDF_CONTEXT_CHARS = 15_000
REDIS_JOB_PREFIX = "mindflip:job:"

FLASHCARD_SYSTEM = """You are an expert educator. Generate a summary and flashcards from academic content.
Always respond with valid JSON only. No preamble, no markdown, no explanation.
Required JSON format:
{
  "summary": "Comprehensive summary of the provided text...",
  "flashcards": [
    {
      "front": "Specific testable question",
      "back": "Concise but complete answer"
    }
  ]
}"""

WORKBOOK_SYSTEM = """You are an expert educator creating study workbooks.
Always respond with valid JSON only.
Output format: {"sections": [{"title": "...", "summary": "...", "key_points": [...], "practice_questions": [...]}]}"""


def _redis() -> redis.Redis:
    return redis.Redis.from_url(settings.REDIS_URL, decode_responses=True)


def _cache_job(task_id: str, payload: dict) -> None:
    try:
        _redis().setex(REDIS_JOB_PREFIX + task_id, 7200, json.dumps(payload))
    except Exception as exc:  # pragma: no cover
        log.warning("job_redis_cache_failed", extra={"task_id": task_id, "error": str(exc)})


def _cached_job(task_id: str) -> dict | None:
    try:
        raw = _redis().get(REDIS_JOB_PREFIX + task_id)
        if raw is not None and isinstance(raw, (str, bytes)):
            return json.loads(raw)
    except Exception:
        pass
    return None


def _extract_pdf_text(data: bytes) -> str:
    reader = PdfReader(BytesIO(data))
    parts: list[str] = []
    for page in reader.pages:
        try:
            t = page.extract_text() or ""
        except Exception:
            t = ""
        if t:
            parts.append(t)
    return "\n".join(parts)


def _extract_context_for_chapters(full_text: str, selected_chapters: list[str] | None) -> str:
    if not selected_chapters:
        return full_text[:PDF_CONTEXT_CHARS]
    
    # Try to find the section between the first and last selected chapter
    # We use a simple case-insensitive search
    text_lower = full_text.lower()
    start_idx = 0
    end_idx = len(full_text)
    
    first_ch = selected_chapters[0].lower()
    last_ch = selected_chapters[-1].lower()
    
    # Simple search for the titles
    first_pos = text_lower.find(first_ch)
    if first_pos != -1:
        start_idx = max(0, first_pos - 100) # give 100 chars of buffer
        
    last_pos = text_lower.find(last_ch, first_pos if first_pos != -1 else 0)
    if last_pos != -1:
        # Find next chapter or just give 15k chars from the start of the last chapter
        end_idx = min(len(full_text), last_pos + PDF_CONTEXT_CHARS)
        
    snapped = full_text[start_idx:end_idx]
    # If we somehow got nothing, fallback
    if len(snapped.strip()) < 100:
        return full_text[:PDF_CONTEXT_CHARS]
        
    return snapped[:PDF_CONTEXT_CHARS]


def _call_anthropic_flashcards(
    *,
    book_title: str,
    text: str,
    num_cards: int,
    user_id: UUID,
    celery_task_id: str,
    selected_chapters: list[str] | None = None,
) -> dict[str, Any]:
    client = get_anthropic_client()
    truncated = text[:PDF_CONTEXT_CHARS]
    message = client.messages.create(
        model=CLAUDE_SONNET_MODEL,
        max_tokens=4096,
        system=FLASHCARD_SYSTEM,
        messages=[
            {
                "role": "user",
                "content": (
                    f"Generate a summary and exactly {num_cards} flashcards from this text.\n\n"
                    f"Book title: {book_title}\n"
                    f"Selected Chapters: {', '.join(selected_chapters) if selected_chapters else 'Entire selection'}\n\n"
                    f"TEXT:\n{truncated}\n\n"
                    "Respond with ONLY valid JSON. Focus ONLY on the information within the specified chapters."
                ),
            },
        ],
    )
    usage = message.usage
    log_token_usage(
        task="generate_flashcards",
        user_id=user_id,
        input_tokens=usage.input_tokens,
        output_tokens=usage.output_tokens,
        celery_task_id=celery_task_id,
    )
    raw = ""
    for block in message.content:
        if hasattr(block, "text"):
            raw += block.text
        elif isinstance(block, dict) and block.get("type") == "text":
            raw += block.get("text", "")
    data = parse_model_json(raw)
    
    summary = str(data.get("summary", "")).strip()
    cards_raw = data.get("flashcards") or data.get("cards") or []
    
    validated_cards = validate_flashcards(cards_raw, expected=num_cards)
    
    return {
        "summary": summary,
        "flashcards": validated_cards
    }


def _call_anthropic_workbook(
    *,
    book_title: str,
    author: str,
    text: str,
    title: str,
    chapter_hint: str | None,
    user_id: UUID,
    celery_task_id: str,
    selected_chapters: list[str] | None = None,
) -> dict:
    client = get_anthropic_client()
    truncated = text[:PDF_CONTEXT_CHARS]
    hint = f"\nFocus areas / chapters: {chapter_hint}\n" if chapter_hint else ""
    message = client.messages.create(
        model=CLAUDE_SONNET_MODEL,
        max_tokens=4096,
        system=WORKBOOK_SYSTEM,
        messages=[
            {
                "role": "user",
                "content": (
                    f'Build a study workbook as JSON for "{book_title}" by {author}.\n'
                    f'Workbook display title: "{title}".{hint}\n'
                    f"Selected Chapters: {', '.join(selected_chapters) if selected_chapters else 'Entire selection'}\n\n"
                    f"TEXT:\n{truncated}\n\n"
                    "Respond with JSON only. Include 3–8 sections based ONLY on the specified chapters."
                ),
            },
        ],
    )
    usage = message.usage
    log_token_usage(
        task="generate_workbook",
        user_id=user_id,
        input_tokens=usage.input_tokens,
        output_tokens=usage.output_tokens,
        celery_task_id=celery_task_id,
    )
    raw = ""
    for block in message.content:
        if hasattr(block, "text"):
            raw += block.text
        elif isinstance(block, dict) and block.get("type") == "text":
            raw += block.get("text", "")
    data = parse_model_json(raw)
    if "sections" in data and isinstance(data["sections"], list):
        chapters = sections_to_chapters(data["sections"])
    elif "chapters" in data and isinstance(data["chapters"], list):
        chapters = [
            {**ch, "user_notes": ""} if isinstance(ch, dict) else ch
            for ch in data["chapters"]
            if isinstance(ch, dict)
        ]
    else:
        raise ValueError("sections or chapters must be a list")
    content = {"chapters": chapters}
    return validate_workbook_content(content)


def _is_final_attempt(task) -> bool:
    return int(task.request.retries) >= int(task.max_retries)


def _handle_task_retry(task, *, job_kind: str, task_id: str, exc: Exception) -> None:
    log.warning(
        "ai_task_retry",
        extra={
            "job_kind": job_kind,
            "celery_task_id": task_id,
            "retry": task.request.retries,
            "max_retries": task.max_retries,
            "error": str(exc),
        },
        exc_info=True,
    )
    if _is_final_attempt(task):
        _cache_job(task_id, {"status": "error", "error": str(exc)[:500]})
    raise task.retry(exc=exc) from exc


@celery.task(
    bind=True,
    name="tasks.ai_tasks.generate_flashcards_task",
    max_retries=3,
    default_retry_delay=30,
)
def generate_flashcards_task(
    self,
    book_id: str,
    user_id: str,
    set_title: str,
    num_cards: int,
    selected_chapters: list[str] | None = None,
) -> dict[str, str]:
    tid = self.request.id
    uid = UUID(user_id)
    bid = UUID(book_id)
    n_cards = int(num_cards)

    cached = _cached_job(tid)
    if cached and cached.get("status") == "complete" and cached.get("set_id"):
        return {"status": "complete", "set_id": cached["set_id"]}

    _cache_job(tid, {"status": "started"})

    try:
        with sync_session() as db:
            existing = find_flashcard_set_for_job(db, user_id=uid, task_id=tid)
            if existing is not None:
                sid = str(existing.id)
                book = db.get(Book, bid)
                if book is not None:
                    mark_book_ai_finished(
                        db,
                        book,
                        job_type="flashcards",
                        task_id=tid,
                        success=True,
                        resource_id=sid,
                    )
                payload = {"status": "complete", "set_id": sid}
                _cache_job(tid, payload)
                return payload

            book = db.execute(select(Book).where(Book.id == bid)).scalar_one_or_none()
            if book is None or book.user_id != uid:
                raise ValueError("Book not found or access denied")
            mark_book_ai_processing(db, book, job_type="flashcards", task_id=tid)
            pdf_bytes = get_object_bytes(book.s3_key)
            full_text = _extract_pdf_text(pdf_bytes)
            if not full_text.strip():
                raise ValueError("No extractable text from PDF")
            
            text = _extract_context_for_chapters(full_text, selected_chapters)
            book_title = book.title

        result = _call_anthropic_flashcards(
            book_title=book_title,
            text=text,
            num_cards=n_cards,
            user_id=uid,
            celery_task_id=tid,
            selected_chapters=selected_chapters,
        )
        summary = result["summary"]
        cards_data = result["flashcards"]

        with sync_session() as db:
            dup = find_flashcard_set_for_job(db, user_id=uid, task_id=tid)
            if dup is not None:
                sid = str(dup.id)
            else:
                book = db.execute(select(Book).where(Book.id == bid)).scalar_one()
                fset = FlashcardSet(
                    user_id=uid,
                    book_id=book.id,
                    title=set_title,
                    description=summary or celery_job_description(tid),
                )
                db.add(fset)
                db.flush()
                for c in cards_data:
                    db.add(Flashcard(set_id=fset.id, front=c["front"], back=c["back"]))
                db.add(
                    StudyEvent(
                        user_id=uid,
                        set_id=fset.id,
                        event_type="ai_generation",
                    ),
                )
                mark_book_ai_finished(
                    db,
                    book,
                    job_type="flashcards",
                    task_id=tid,
                    success=True,
                    resource_id=str(fset.id),
                )
                sid = str(fset.id)

        payload = {"status": "complete", "set_id": sid}
        _cache_job(tid, payload)
        return payload

    except Exception as exc:
        if _is_final_attempt(self):
            with sync_session() as db:
                book = db.execute(select(Book).where(Book.id == bid)).scalar_one_or_none()
                if book is not None:
                    mark_book_ai_finished(
                        db,
                        book,
                        job_type="flashcards",
                        task_id=tid,
                        success=False,
                        error=str(exc),
                    )
        _handle_task_retry(self, job_kind="flashcards", task_id=tid, exc=exc)
        raise AssertionError("unreachable") from exc


@celery.task(
    bind=True,
    name="tasks.ai_tasks.generate_workbook_task",
    max_retries=3,
    default_retry_delay=30,
)
def generate_workbook_task(
    self,
    book_id: str,
    user_id: str,
    title: str,
    chapter_hint: str | None = None,
    selected_chapters: list[str] | None = None,
) -> dict[str, str]:
    tid = self.request.id
    uid = UUID(user_id)
    bid = UUID(book_id)

    cached = _cached_job(tid)
    if cached and cached.get("status") == "complete" and cached.get("workbook_id"):
        return {"status": "complete", "workbook_id": cached["workbook_id"]}

    _cache_job(tid, {"status": "started"})

    try:
        with sync_session() as db:
            wb_existing = find_workbook_for_job(db, user_id=uid, task_id=tid)
            if wb_existing is not None and wb_existing.status == WorkbookStatus.ready:
                wid = str(wb_existing.id)
                payload = {"status": "complete", "workbook_id": wid}
                _cache_job(tid, payload)
                return payload

            book = db.execute(select(Book).where(Book.id == bid)).scalar_one_or_none()
            if book is None or book.user_id != uid:
                raise ValueError("Book not found or access denied")
            mark_book_ai_processing(db, book, job_type="workbook", task_id=tid)

            if wb_existing is None:
                wb_existing = Workbook(
                    user_id=uid,
                    book_id=book.id,
                    title=title,
                    content={"_job_id": tid, "chapters": []},
                    status=WorkbookStatus.generating,
                )
                db.add(wb_existing)
                db.flush()
            wb_id = wb_existing.id
            pdf_bytes = get_object_bytes(book.s3_key)
            full_text = _extract_pdf_text(pdf_bytes)
            if not full_text.strip():
                raise ValueError("No extractable text from PDF")
            
            text = _extract_context_for_chapters(full_text, selected_chapters)
            book_title, book_author = book.title, book.author

        content = _call_anthropic_workbook(
            book_title=book_title,
            author=book_author,
            text=text,
            title=title,
            chapter_hint=chapter_hint,
            user_id=uid,
            celery_task_id=tid,
            selected_chapters=selected_chapters,
        )
        content["_job_id"] = tid

        with sync_session() as db:
            wb = db.execute(select(Workbook).where(Workbook.id == wb_id)).scalar_one()
            wb.content = content
            wb.status = WorkbookStatus.ready
            book = db.execute(select(Book).where(Book.id == bid)).scalar_one()
            db.add(StudyEvent(user_id=uid, event_type="ai_generation"))
            mark_book_ai_finished(
                db,
                book,
                job_type="workbook",
                task_id=tid,
                success=True,
                resource_id=str(wb.id),
            )
            wid = str(wb.id)

        payload = {"status": "complete", "workbook_id": wid}
        _cache_job(tid, payload)
        return payload

    except Exception as exc:
        if _is_final_attempt(self):
            with sync_session() as db:
                book = db.execute(select(Book).where(Book.id == bid)).scalar_one_or_none()
                if book is not None:
                    mark_book_ai_finished(
                        db,
                        book,
                        job_type="workbook",
                        task_id=tid,
                        success=False,
                        error=str(exc),
                    )
                wb = find_workbook_for_job(db, user_id=uid, task_id=tid)
                if wb is not None:
                    wb.status = WorkbookStatus.error
        _handle_task_retry(self, job_kind="workbook", task_id=tid, exc=exc)
        raise AssertionError("unreachable") from exc
