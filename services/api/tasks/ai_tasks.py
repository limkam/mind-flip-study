"""Celery tasks: download book PDF from S3, extract text, call Anthropic, persist rows."""

from __future__ import annotations

import logging
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from io import BytesIO
from typing import Any
from uuid import UUID

from pypdf import PdfReader
from sqlalchemy import select

from ai_generation import (
    build_set_description,
    find_flashcard_set_for_job,
    find_workbook_for_job,
    mark_book_ai_finished,
    mark_book_ai_processing,
    parse_model_json,
    sections_to_chapters,
    validate_flashcards,
    validate_scenarios,
    validate_workbook_content,
)
from anthropic_client import CLAUDE_SONNET_MODEL, get_anthropic_client
from database_sync import sync_session
from job_cache import cache_job, get_cached_job
from models.book import Book
from models.enums import WorkbookStatus
from models.flashcard import Flashcard, FlashcardSet, Workbook
from models.quiz import StudyEvent
from s3_service import get_object_bytes
from tasks.celery_app import celery
from token_usage_log import log_token_usage

log = logging.getLogger(__name__)

PDF_CONTEXT_CHARS = 15_000
FLASHCARD_BATCH_SIZE = 25
AI_CALL_MAX_ATTEMPTS = 3

FLASHCARD_BATCH_SYSTEM = """You are an expert educator. Generate flashcards from academic content.
Always respond with valid JSON only. No preamble, no markdown, no explanation.
Required JSON format:
{
  "flashcards": [
    {
      "front": "Specific testable question",
      "back": "Concise but complete answer"
    }
  ]
}"""

SUMMARY_SYSTEM = """You are an expert educator. Summarize academic content clearly and comprehensively.
Always respond with valid JSON only.
Required JSON format:
{"summary": "Comprehensive summary of the provided text..."}"""

SCENARIO_SYSTEM = """You are an expert educator creating realistic application-based study scenarios.
Always respond with valid JSON only.
Required format:
{
  "scenarios": [
    {
      "title": "Short scenario title",
      "prompt": "Realistic situational question applying concepts from the material",
      "guidance": "Key points a strong answer should cover"
    }
  ]
}
Create scenarios that require applying concepts — not simple recall. Adapt tone to the subject (business, medical, law, STEM, etc.)."""

WORKBOOK_SYSTEM = """You are an expert educator creating study workbooks.
Always respond with valid JSON only.
Output format: {"sections": [{"title": "...", "summary": "...", "key_points": [...], "practice_questions": [...]}]}"""


def _update_job_progress(task_id: str, phase: str, **extra: Any) -> None:
    cache_job(task_id, {"status": "started", "phase": phase, **extra})


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

    text_lower = full_text.lower()
    start_idx = 0
    end_idx = len(full_text)

    first_ch = selected_chapters[0].lower()
    last_ch = selected_chapters[-1].lower()

    first_pos = text_lower.find(first_ch)
    if first_pos != -1:
        start_idx = max(0, first_pos - 100)

    last_pos = text_lower.find(last_ch, first_pos if first_pos != -1 else 0)
    if last_pos != -1:
        end_idx = min(len(full_text), last_pos + PDF_CONTEXT_CHARS)

    snapped = full_text[start_idx:end_idx]
    if len(snapped.strip()) < 100:
        return full_text[:PDF_CONTEXT_CHARS]

    return snapped[:PDF_CONTEXT_CHARS]


def _extract_response_text(message: Any) -> str:
    raw = ""
    for block in message.content:
        if hasattr(block, "text"):
            raw += block.text
        elif isinstance(block, dict) and block.get("type") == "text":
            raw += block.get("text", "")
    return raw


def _max_tokens_for_cards(num_cards: int) -> int:
    return min(8192, 256 + num_cards * 140)


def _call_with_retry(fn, *, label: str) -> Any:
    last_exc: Exception | None = None
    for attempt in range(AI_CALL_MAX_ATTEMPTS):
        try:
            return fn()
        except Exception as exc:
            last_exc = exc
            log.warning(
                "anthropic_call_retry",
                extra={"label": label, "attempt": attempt + 1, "error": str(exc)},
            )
            if attempt + 1 >= AI_CALL_MAX_ATTEMPTS:
                raise
            time.sleep(2**attempt)
    raise last_exc or RuntimeError(f"{label} failed")


def _anthropic_json_call(
    *,
    system: str,
    user_content: str,
    max_tokens: int,
    task: str,
    user_id: UUID,
    celery_task_id: str,
) -> dict[str, Any]:
    def _run() -> dict[str, Any]:
        client = get_anthropic_client()
        message = client.messages.create(
            model=CLAUDE_SONNET_MODEL,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": user_content}],
        )
        usage = message.usage
        log_token_usage(
            task=task,
            user_id=user_id,
            input_tokens=usage.input_tokens,
            output_tokens=usage.output_tokens,
            celery_task_id=celery_task_id,
        )
        return parse_model_json(_extract_response_text(message))

    return _call_with_retry(_run, label=task)


def _flashcard_batches(num_cards: int) -> list[int]:
    batches: list[int] = []
    remaining = num_cards
    while remaining > 0:
        take = min(FLASHCARD_BATCH_SIZE, remaining)
        batches.append(take)
        remaining -= take
    return batches or [num_cards]


def _scenario_count(num_cards: int) -> int:
    return min(5, max(2, num_cards // 20))


def _call_anthropic_summary(
    *,
    book_title: str,
    text: str,
    user_id: UUID,
    celery_task_id: str,
    selected_chapters: list[str] | None = None,
) -> str:
    truncated = text[:PDF_CONTEXT_CHARS]
    chapters = ", ".join(selected_chapters) if selected_chapters else "Entire selection"
    data = _anthropic_json_call(
        system=SUMMARY_SYSTEM,
        user_content=(
            f"Summarize this academic text from \"{book_title}\".\n"
            f"Selected chapters: {chapters}\n\n"
            f"TEXT:\n{truncated}\n\n"
            "Respond with ONLY valid JSON."
        ),
        max_tokens=1536,
        task="generate_summary",
        user_id=user_id,
        celery_task_id=celery_task_id,
    )
    summary = str(data.get("summary", "")).strip()
    if not summary:
        raise ValueError("Model returned empty summary")
    return summary


def _call_anthropic_flashcards_batch(
    *,
    book_title: str,
    text: str,
    num_cards: int,
    batch_index: int,
    batch_total: int,
    user_id: UUID,
    celery_task_id: str,
    selected_chapters: list[str] | None = None,
) -> list[dict[str, str]]:
    truncated = text[:PDF_CONTEXT_CHARS]
    chapters = ", ".join(selected_chapters) if selected_chapters else "Entire selection"
    data = _anthropic_json_call(
        system=FLASHCARD_BATCH_SYSTEM,
        user_content=(
            f"Generate exactly {num_cards} flashcards from this text.\n"
            f"Book title: {book_title}\n"
            f"Selected chapters: {chapters}\n"
            f"This is batch {batch_index} of {batch_total} — create distinct cards not covered in other batches.\n\n"
            f"TEXT:\n{truncated}\n\n"
            "Respond with ONLY valid JSON. Focus ONLY on the specified chapters."
        ),
        max_tokens=_max_tokens_for_cards(num_cards),
        task="generate_flashcards",
        user_id=user_id,
        celery_task_id=celery_task_id,
    )
    cards_raw = data.get("flashcards") or data.get("cards") or []
    return validate_flashcards(cards_raw, expected=num_cards)


def _call_anthropic_scenarios(
    *,
    book_title: str,
    text: str,
    num_scenarios: int,
    user_id: UUID,
    celery_task_id: str,
    selected_chapters: list[str] | None = None,
) -> list[dict[str, str]]:
    truncated = text[:PDF_CONTEXT_CHARS]
    chapters = ", ".join(selected_chapters) if selected_chapters else "Entire selection"
    data = _anthropic_json_call(
        system=SCENARIO_SYSTEM,
        user_content=(
            f"Create exactly {num_scenarios} realistic application scenarios based on this material.\n"
            f"Book title: {book_title}\n"
            f"Selected chapters: {chapters}\n\n"
            f"TEXT:\n{truncated}\n\n"
            "Respond with ONLY valid JSON."
        ),
        max_tokens=2048,
        task="generate_scenarios",
        user_id=user_id,
        celery_task_id=celery_task_id,
    )
    scenarios_raw = data.get("scenarios") or []
    return validate_scenarios(scenarios_raw, expected=num_scenarios)


def _generate_study_content_parallel(
    *,
    book_title: str,
    text: str,
    num_cards: int,
    user_id: UUID,
    celery_task_id: str,
    selected_chapters: list[str] | None,
) -> tuple[str, list[dict[str, str]], list[dict[str, str]]]:
    batches = _flashcard_batches(num_cards)
    num_scenarios = _scenario_count(num_cards)
    summary: str | None = None
    scenarios: list[dict[str, str]] | None = None
    cards_by_batch: dict[int, list[dict[str, str]]] = {}

    _update_job_progress(celery_task_id, "generating_summary")
    with ThreadPoolExecutor(max_workers=min(6, len(batches) + 2)) as pool:
        summary_future = pool.submit(
            _call_anthropic_summary,
            book_title=book_title,
            text=text,
            user_id=user_id,
            celery_task_id=celery_task_id,
            selected_chapters=selected_chapters,
        )
        scenario_future = pool.submit(
            _call_anthropic_scenarios,
            book_title=book_title,
            text=text,
            num_scenarios=num_scenarios,
            user_id=user_id,
            celery_task_id=celery_task_id,
            selected_chapters=selected_chapters,
        )
        card_futures = {
            pool.submit(
                _call_anthropic_flashcards_batch,
                book_title=book_title,
                text=text,
                num_cards=batch_size,
                batch_index=i + 1,
                batch_total=len(batches),
                user_id=user_id,
                celery_task_id=celery_task_id,
                selected_chapters=selected_chapters,
            ): i
            for i, batch_size in enumerate(batches)
        }

        _update_job_progress(celery_task_id, "generating_flashcards")
        for fut in as_completed(card_futures):
            cards_by_batch[card_futures[fut]] = fut.result()

        _update_job_progress(celery_task_id, "generating_scenarios")
        summary = summary_future.result()
        scenarios = scenario_future.result()

    ordered_cards: list[dict[str, str]] = []
    for i in range(len(batches)):
        ordered_cards.extend(cards_by_batch.get(i, []))

    if len(ordered_cards) < num_cards:
        log.warning(
            "flashcard_count_shortfall",
            extra={
                "celery_task_id": celery_task_id,
                "expected": num_cards,
                "got": len(ordered_cards),
            },
        )

    return summary, ordered_cards[:num_cards], scenarios or []


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
    truncated = text[:PDF_CONTEXT_CHARS]
    hint = f"\nFocus areas / chapters: {chapter_hint}\n" if chapter_hint else ""
    data = _anthropic_json_call(
        system=WORKBOOK_SYSTEM,
        user_content=(
            f'Build a study workbook as JSON for "{book_title}" by {author}.\n'
            f'Workbook display title: "{title}".{hint}\n'
            f"Selected Chapters: {', '.join(selected_chapters) if selected_chapters else 'Entire selection'}\n\n"
            f"TEXT:\n{truncated}\n\n"
            "Respond with JSON only. Include 3–8 sections based ONLY on the specified chapters."
        ),
        max_tokens=4096,
        task="generate_workbook",
        user_id=user_id,
        celery_task_id=celery_task_id,
    )
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
        cache_job(task_id, {"status": "error", "phase": "failed", "error": str(exc)[:500]})
    else:
        cache_job(task_id, {"status": "started", "phase": "retrying", "error": str(exc)[:200]})
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

    log.info(
        "flashcard_generation_started",
        extra={"celery_task_id": tid, "book_id": book_id, "num_cards": n_cards},
    )

    cached = get_cached_job(tid)
    if cached and cached.get("status") == "complete" and cached.get("set_id"):
        return {"status": "complete", "set_id": cached["set_id"]}

    cache_job(tid, {"status": "started", "phase": "starting", "book_id": book_id})

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
                payload = {"status": "complete", "phase": "completed", "set_id": sid}
                cache_job(tid, payload)
                log.info("flashcard_generation_complete", extra={"celery_task_id": tid, "set_id": sid, "cached": True})
                return payload

            book = db.execute(select(Book).where(Book.id == bid)).scalar_one_or_none()
            if book is None or book.user_id != uid:
                raise ValueError("Book not found or access denied")
            mark_book_ai_processing(db, book, job_type="flashcards", task_id=tid)

            _update_job_progress(tid, "extracting_text", book_id=book_id)
            pdf_bytes = get_object_bytes(book.s3_key)
            full_text = _extract_pdf_text(pdf_bytes)
            if not full_text.strip():
                raise ValueError("No extractable text from PDF")

            text = _extract_context_for_chapters(full_text, selected_chapters)
            book_title = book.title

        summary, cards_data, scenarios = _generate_study_content_parallel(
            book_title=book_title,
            text=text,
            num_cards=n_cards,
            user_id=uid,
            celery_task_id=tid,
            selected_chapters=selected_chapters,
        )

        _update_job_progress(tid, "saving_content", book_id=book_id)

        with sync_session() as db:
            dup = find_flashcard_set_for_job(db, user_id=uid, task_id=tid)
            if dup is not None:
                sid = str(dup.id)
            else:
                book = db.execute(select(Book).where(Book.id == bid)).scalar_one()
                description = build_set_description(
                    summary=summary,
                    job_id=tid,
                    selected_chapters=selected_chapters,
                    scenarios=scenarios,
                )
                fset = FlashcardSet(
                    user_id=uid,
                    book_id=book.id,
                    title=set_title,
                    description=description,
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

        payload = {
            "status": "complete",
            "phase": "completed",
            "set_id": sid,
            "card_count": len(cards_data),
            "scenario_count": len(scenarios),
        }
        cache_job(tid, payload)
        log.info(
            "flashcard_generation_complete",
            extra={
                "celery_task_id": tid,
                "set_id": sid,
                "cards": len(cards_data),
                "scenarios": len(scenarios),
            },
        )
        return payload

    except Exception as exc:
        log.error(
            "flashcard_generation_failed",
            extra={"celery_task_id": tid, "book_id": book_id, "error": str(exc)},
            exc_info=True,
        )
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

    cached = get_cached_job(tid)
    if cached and cached.get("status") == "complete" and cached.get("workbook_id"):
        return {"status": "complete", "workbook_id": cached["workbook_id"]}

    cache_job(tid, {"status": "started", "phase": "starting"})

    try:
        with sync_session() as db:
            wb_existing = find_workbook_for_job(db, user_id=uid, task_id=tid)
            if wb_existing is not None and wb_existing.status == WorkbookStatus.ready:
                wid = str(wb_existing.id)
                payload = {"status": "complete", "workbook_id": wid}
                cache_job(tid, payload)
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
        cache_job(tid, payload)
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
