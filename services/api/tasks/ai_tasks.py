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
    validate_generation_bundle,
    validate_scenarios,
    validate_workbook_content,
)
from anthropic_client import CLAUDE_SONNET_MODEL, get_anthropic_client
from chapter_distribution import allocate_card_quotas
from content_map import build_content_map, content_map_to_metadata
from database_sync import sync_session
from difficulty_engine import difficulty_quota
from generation_prompts import (
    CHAPTER_SUMMARY_SYSTEM,
    FLASHCARD_SYSTEM,
    SCENARIO_SYSTEM,
    chapter_summary_user_prompt,
    flashcard_user_prompt,
    overview_summary_user_prompt,
    scenarios_user_prompt,
)
from job_cache import cache_job, get_cached_job
from models.book import Book
from models.enums import WorkbookStatus
from models.flashcard import Flashcard, FlashcardSet, Workbook
from models.quiz import StudyEvent
from s3_service import get_object_bytes
from seeded_random import make_generation_seed, pick_variation_style
from tasks.celery_app import celery
from token_usage_log import log_token_usage

log = logging.getLogger(__name__)

AI_CALL_MAX_ATTEMPTS = 3
QA_MAX_ATTEMPTS = 2
CHAPTER_EXCERPT_JOIN_MAX = 12_000

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


def _toc_titles(book: Book) -> list[str]:
    extras = book.extras or {}
    toc = extras.get("table_of_contents") or []
    titles: list[str] = []
    if isinstance(toc, list):
        for item in toc:
            if isinstance(item, dict):
                t = str(item.get("title", "")).strip()
                if t:
                    titles.append(t)
            elif item:
                titles.append(str(item).strip())
    return titles


def _extract_response_text(message: Any) -> str:
    raw = ""
    for block in message.content:
        if hasattr(block, "text"):
            raw += block.text
        elif isinstance(block, dict) and block.get("type") == "text":
            raw += block.get("text", "")
    return raw


def _max_tokens_for_cards(num_cards: int) -> int:
    return min(8192, 384 + num_cards * 160)


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


def _generate_chapter_flashcards(
    *,
    book_title: str,
    chapter_title: str,
    chapter_text: str,
    num_cards: int,
    user_id: UUID,
    celery_task_id: str,
    generation_seed: int,
    batch_index: int,
    qa_feedback: str = "",
) -> list[dict[str, str]]:
    quota = difficulty_quota(num_cards)
    style = pick_variation_style(generation_seed, chapter_title, batch_index)
    note = f"QA feedback from prior attempt: {qa_feedback}" if qa_feedback else ""
    data = _anthropic_json_call(
        system=FLASHCARD_SYSTEM,
        user_content=flashcard_user_prompt(
            book_title=book_title,
            chapter_title=chapter_title,
            chapter_text=chapter_text,
            num_cards=num_cards,
            difficulty_quota=quota,
            style_index=style,
            batch_note=note,
        ),
        max_tokens=_max_tokens_for_cards(num_cards),
        task="generate_flashcards",
        user_id=user_id,
        celery_task_id=celery_task_id,
    )
    cards_raw = data.get("flashcards") or data.get("cards") or []
    return validate_flashcards(cards_raw, expected=num_cards, chapter_title=chapter_title)


def _generate_chapter_summary(
    *,
    book_title: str,
    chapter_title: str,
    chapter_text: str,
    user_id: UUID,
    celery_task_id: str,
) -> dict[str, Any]:
    data = _anthropic_json_call(
        system=CHAPTER_SUMMARY_SYSTEM,
        user_content=chapter_summary_user_prompt(
            book_title=book_title,
            chapter_title=chapter_title,
            chapter_text=chapter_text,
        ),
        max_tokens=1200,
        task="generate_chapter_summary",
        user_id=user_id,
        celery_task_id=celery_task_id,
    )
    summary = str(data.get("summary", "")).strip()
    key_points = data.get("key_points") or []
    if not summary:
        raise ValueError(f"Empty summary for chapter {chapter_title}")
    return {
        "chapter": chapter_title,
        "summary": summary,
        "key_points": [str(k).strip() for k in key_points if str(k).strip()],
    }


def _generate_scenarios(
    *,
    book_title: str,
    segments_text: str,
    user_id: UUID,
    celery_task_id: str,
    generation_seed: int,
    qa_feedback: str = "",
) -> list[dict[str, str]]:
    seed_note = f"Use variation profile #{generation_seed % 997}. {qa_feedback}".strip()
    data = _anthropic_json_call(
        system=SCENARIO_SYSTEM,
        user_content=scenarios_user_prompt(
            book_title=book_title,
            chapter_excerpts=segments_text[:CHAPTER_EXCERPT_JOIN_MAX],
            seed_note=seed_note,
        ),
        max_tokens=4096,
        task="generate_scenarios",
        user_id=user_id,
        celery_task_id=celery_task_id,
    )
    scenarios_raw = data.get("scenarios") or []
    return validate_scenarios(scenarios_raw, expected=5)


def _generate_overview_summary(
    *,
    book_title: str,
    chapter_summaries: list[dict[str, Any]],
    user_id: UUID,
    celery_task_id: str,
) -> str:
    data = _anthropic_json_call(
        system=CHAPTER_SUMMARY_SYSTEM,
        user_content=overview_summary_user_prompt(book_title=book_title, chapter_summaries=chapter_summaries),
        max_tokens=1800,
        task="generate_summary",
        user_id=user_id,
        celery_task_id=celery_task_id,
    )
    summary = str(data.get("summary", "")).strip()
    if not summary:
        raise ValueError("Model returned empty overview summary")
    return summary


def _generate_study_content(
    *,
    book_title: str,
    full_text: str,
    toc_titles: list[str],
    selected_chapters: list[str] | None,
    num_cards: int,
    user_id: UUID,
    celery_task_id: str,
    generation_seed: int,
) -> tuple[str, list[dict[str, str]], list[dict[str, str]], list[dict[str, Any]]]:
    segments = build_content_map(full_text, toc_titles, selected=selected_chapters)
    if not segments:
        raise ValueError("Could not build content map from document")

    allocations = allocate_card_quotas(num_cards, segments)
    chapter_titles = [seg.title for seg, _ in allocations]
    quotas = {seg.title: quota for seg, quota in allocations}

    last_qa_errors: list[str] = []
    for qa_attempt in range(QA_MAX_ATTEMPTS):
        qa_feedback = "; ".join(last_qa_errors) if last_qa_errors else ""
        all_cards: list[dict[str, str]] = []
        chapter_summaries: list[dict[str, Any]] = []

        _update_job_progress(celery_task_id, "generating_summary")
        _update_job_progress(celery_task_id, "generating_flashcards")

        with ThreadPoolExecutor(max_workers=min(8, len(allocations) + 2)) as pool:
            card_futures = {
                pool.submit(
                    _generate_chapter_flashcards,
                    book_title=book_title,
                    chapter_title=seg.title,
                    chapter_text=seg.text,
                    num_cards=quota,
                    user_id=user_id,
                    celery_task_id=celery_task_id,
                    generation_seed=generation_seed + qa_attempt,
                    batch_index=i,
                    qa_feedback=qa_feedback,
                ): seg.title
                for i, (seg, quota) in enumerate(allocations)
            }
            summary_futures = {
                pool.submit(
                    _generate_chapter_summary,
                    book_title=book_title,
                    chapter_title=seg.title,
                    chapter_text=seg.text,
                    user_id=user_id,
                    celery_task_id=celery_task_id,
                ): seg.title
                for seg, _ in allocations
            }
            excerpt = "\n\n---\n\n".join(f"## {s.title}\n{s.text[:2000]}" for s, _ in allocations)
            scenario_future = pool.submit(
                _generate_scenarios,
                book_title=book_title,
                segments_text=excerpt,
                user_id=user_id,
                celery_task_id=celery_task_id,
                generation_seed=generation_seed + qa_attempt,
                qa_feedback=qa_feedback,
            )

            for fut in as_completed(card_futures):
                all_cards.extend(fut.result())

            _update_job_progress(celery_task_id, "generating_scenarios")
            for fut in as_completed(summary_futures):
                chapter_summaries.append(fut.result())
            chapter_summaries.sort(key=lambda s: chapter_titles.index(s["chapter"]) if s["chapter"] in chapter_titles else 999)
            scenarios = scenario_future.result()

        overview = _generate_overview_summary(
            book_title=book_title,
            chapter_summaries=chapter_summaries,
            user_id=user_id,
            celery_task_id=celery_task_id,
        )

        qa_errors = validate_generation_bundle(
            cards=all_cards,
            scenarios=scenarios,
            chapter_titles=chapter_titles,
            quotas=quotas,
            num_cards=num_cards,
        )
        if not qa_errors:
            trimmed = all_cards[:num_cards]
            log.info(
                "generation_qa_passed",
                extra={"celery_task_id": celery_task_id, "cards": len(trimmed), "chapters": len(chapter_titles)},
            )
            return overview, trimmed, scenarios, chapter_summaries

        last_qa_errors = qa_errors
        log.warning(
            "generation_qa_failed",
            extra={"celery_task_id": celery_task_id, "attempt": qa_attempt + 1, "errors": qa_errors},
        )

    raise ValueError(f"Generation QA failed after {QA_MAX_ATTEMPTS} attempts: {'; '.join(last_qa_errors)}")


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
    truncated = text[:15_000]
    hint = f"\nFocus areas / chapters: {chapter_hint}\n" if chapter_hint else ""
    data = _anthropic_json_call(
        system=WORKBOOK_SYSTEM,
        user_content=(
            f'Build a study workbook as JSON for "{book_title}" by {author}.\n'
            f'Workbook display title: "{title}".{hint}\n'
            f"Selected Chapters: {', '.join(selected_chapters) if selected_chapters else 'Entire selection'}\n\n"
            f"TEXT:\n{truncated}\n\n"
            "Respond with JSON only. Include one section per major chapter/topic from the text."
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
    generation_seed = make_generation_seed(user_id=user_id, book_id=book_id, job_id=tid)

    log.info(
        "flashcard_generation_started",
        extra={"celery_task_id": tid, "book_id": book_id, "num_cards": n_cards, "seed": generation_seed},
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

            book_title = book.title
            toc_titles = _toc_titles(book)

        summary, cards_data, scenarios, chapter_summaries = _generate_study_content(
            book_title=book_title,
            full_text=full_text,
            toc_titles=toc_titles,
            selected_chapters=selected_chapters,
            num_cards=n_cards,
            user_id=uid,
            celery_task_id=tid,
            generation_seed=generation_seed,
        )

        segments = build_content_map(full_text, toc_titles, selected=selected_chapters)
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
                    chapter_summaries=chapter_summaries,
                    generation_seed=generation_seed,
                    content_map=content_map_to_metadata(segments),
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
                    db.add(
                        Flashcard(
                            set_id=fset.id,
                            front=c["front"],
                            back=c["back"],
                            chapter=c.get("chapter") or None,
                            difficulty=c.get("difficulty") or None,
                            cognitive_level=c.get("cognitive_level") or None,
                        ),
                    )
                db.add(StudyEvent(user_id=uid, set_id=fset.id, event_type="ai_generation"))
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
            extra={"celery_task_id": tid, "set_id": sid, "cards": len(cards_data), "scenarios": len(scenarios)},
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

            book_title, book_author = book.title, book.author
            toc = _toc_titles(book)
            segments = build_content_map(full_text, toc, selected=selected_chapters)
            text = "\n\n".join(f"## {s.title}\n{s.text}" for s in segments)[:15_000]

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
