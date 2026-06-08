"""AI output validation, idempotency helpers, and book/job status updates."""

from __future__ import annotations

import json
import logging
import re
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from models.book import Book
from models.enums import BookStatus, WorkbookStatus
from models.flashcard import FlashcardSet, Workbook

log = logging.getLogger(__name__)

CELERY_JOB_DESC_PREFIX = "__celery_job:"


def celery_job_description(task_id: str) -> str:
    return f"{CELERY_JOB_DESC_PREFIX}{task_id}"


def parse_model_json(raw: str) -> dict[str, Any]:
    text = (raw or "").strip()
    if not text:
        raise ValueError("Empty model response")
    try:
        data = json.loads(text)
        if isinstance(data, dict):
            return data
    except json.JSONDecodeError:
        pass
    match = re.search(r"\{[\s\S]*\}", text)
    if not match:
        raise ValueError("No JSON object in model response")
    data = json.loads(match.group())
    if not isinstance(data, dict):
        raise ValueError("Model JSON root must be an object")
    return data


def validate_flashcards(cards: list[dict[str, str]], *, expected: int | None = None) -> list[dict[str, str]]:
    if not cards:
        raise ValueError("Model returned no flashcards")
    validated: list[dict[str, str]] = []
    for i, c in enumerate(cards):
        front = str(c.get("front", "")).strip()
        back = str(c.get("back", "")).strip()
        if not front or not back:
            raise ValueError(f"Card {i} missing non-empty front/back")
        validated.append({"front": front, "back": back})
    if expected is not None and len(validated) < 1:
        raise ValueError(f"Expected at least one card, got {len(validated)}")
    return validated[:expected] if expected else validated


def validate_workbook_content(content: dict[str, Any]) -> dict[str, Any]:
    chapters = content.get("chapters")
    if not isinstance(chapters, list) or not chapters:
        raise ValueError("Workbook must contain at least one chapter")
    for i, ch in enumerate(chapters):
        if not isinstance(ch, dict):
            raise ValueError(f"Chapter {i} must be an object")
        if not str(ch.get("chapter_title", "")).strip():
            raise ValueError(f"Chapter {i} missing title")
        if not str(ch.get("lesson", "")).strip():
            raise ValueError(f"Chapter {i} missing lesson/summary")
        kc = ch.get("key_concepts")
        if kc is not None and not isinstance(kc, list):
            raise ValueError(f"Chapter {i} key_concepts must be a list")
        ex = ch.get("exercises")
        if ex is not None and not isinstance(ex, list):
            raise ValueError(f"Chapter {i} exercises must be a list")
    return content


def sections_to_chapters(sections: list[Any]) -> list[dict[str, Any]]:
    chapters: list[dict[str, Any]] = []
    for s in sections:
        if not isinstance(s, dict):
            continue
        title = str(s.get("title", "")).strip()
        summary = str(s.get("summary", "")).strip()
        if not title or not summary:
            continue
        exercises = []
        for q in s.get("practice_questions") or []:
            if isinstance(q, dict):
                exercises.append(
                    {
                        "question": str(q.get("question", "")).strip(),
                        "answer": str(q.get("answer", "")).strip(),
                        "type": str(q.get("type", "short_answer")),
                    },
                )
            elif q is not None:
                exercises.append({"question": str(q).strip(), "answer": "", "type": "short_answer"})
        chapters.append(
            {
                "chapter_title": title,
                "lesson": summary,
                "key_concepts": [str(k).strip() for k in (s.get("key_points") or []) if str(k).strip()],
                "exercises": exercises,
                "user_notes": "",
            },
        )
    if not chapters:
        raise ValueError("No valid sections in model response")
    return chapters


def find_flashcard_set_for_job(db: Session, *, user_id: UUID, task_id: str) -> FlashcardSet | None:
    desc = celery_job_description(task_id)
    return db.execute(
        select(FlashcardSet).where(
            FlashcardSet.user_id == user_id,
            FlashcardSet.description == desc,
        ),
    ).scalar_one_or_none()


def find_workbook_for_job(db: Session, *, user_id: UUID, task_id: str) -> Workbook | None:
    rows = db.execute(
        select(Workbook).where(Workbook.user_id == user_id),
    ).scalars().all()
    for wb in rows:
        if isinstance(wb.content, dict) and str(wb.content.get("_job_id")) == task_id:
            return wb
    return None


def mark_book_ai_processing(db: Session, book: Book, *, job_type: str, task_id: str) -> None:
    extras = dict(book.extras or {})
    extras["ai_job"] = {"type": job_type, "task_id": task_id, "status": "processing"}
    book.extras = extras
    if book.status != BookStatus.error:
        book.status = BookStatus.processing


def mark_book_ai_finished(
    db: Session,
    book: Book,
    *,
    job_type: str,
    task_id: str,
    success: bool,
    error: str | None = None,
    resource_id: str | None = None,
) -> None:
    extras = dict(book.extras or {})
    payload: dict[str, Any] = {
        "type": job_type,
        "task_id": task_id,
        "status": "complete" if success else "error",
    }
    if error:
        payload["error"] = error[:500]
    if resource_id:
        payload["resource_id"] = resource_id
    extras["ai_job"] = payload
    book.extras = extras
    book.status = BookStatus.ready if success else BookStatus.error
    log.info(
        "book_ai_job_finished",
        extra={
            "book_id": str(book.id),
            "job_type": job_type,
            "task_id": task_id,
            "success": success,
        },
    )
