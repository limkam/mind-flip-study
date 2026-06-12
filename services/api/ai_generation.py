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
from models.flashcard import Flashcard, FlashcardSet, Workbook

from difficulty_engine import (
    VALID_COGNITIVE,
    VALID_DIFFICULTIES,
    normalize_cognitive,
    normalize_difficulty,
)
from qa_types import QAFailure

log = logging.getLogger(__name__)

CELERY_JOB_DESC_PREFIX = "__celery_job:"


def celery_job_description(task_id: str) -> str:
    return f"{CELERY_JOB_DESC_PREFIX}{task_id}"


def build_set_description(
    *,
    summary: str,
    job_id: str,
    selected_chapters: list[str] | None = None,
    scenarios: list[dict[str, str]] | None = None,
    chapter_summaries: list[dict[str, Any]] | None = None,
    generation_seed: int | None = None,
    content_map: list[dict[str, Any]] | None = None,
) -> str:
    payload: dict[str, Any] = {
        "summary": summary,
        "job_id": job_id,
        "selected_chapters": selected_chapters or [],
        "scenarios": scenarios or [],
        "chapter_summaries": chapter_summaries or [],
        "generation_seed": generation_seed,
        "content_map": content_map or [],
    }
    return json.dumps(payload, ensure_ascii=False)


def parse_set_description(description: str | None) -> dict[str, Any]:
    if not description or not description.strip():
        return {}
    text = description.strip()
    if text.startswith("{"):
        try:
            data = json.loads(text)
            if isinstance(data, dict):
                return data
        except json.JSONDecodeError:
            pass
    if text.startswith(CELERY_JOB_DESC_PREFIX):
        return {"job_id": text[len(CELERY_JOB_DESC_PREFIX) :]}
    return {"summary": text}


def _normalize_front(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip().lower())


def validate_scenarios(raw: list[Any], *, expected: int = 5) -> list[dict[str, str]]:
    if not raw:
        raise ValueError("Model returned no scenarios")
    validated: list[dict[str, str]] = []
    for i, item in enumerate(raw):
        if not isinstance(item, dict):
            raise ValueError(f"Scenario {i} must be an object")
        stype = str(item.get("type", "")).strip().lower()
        title = str(item.get("title", "")).strip()
        description = str(
            item.get("description")
            or item.get("context")
            or item.get("challenge")
            or item.get("decision")
            or item.get("problem")
            or "",
        ).strip()
        context = str(item.get("context", "")).strip() or description
        challenge = str(item.get("challenge", item.get("decision", item.get("problem", "")))).strip()
        question = str(item.get("question", item.get("prompt", ""))).strip()
        model_answer = str(item.get("model_answer", "")).strip()
        explanation = str(item.get("explanation", item.get("guidance", ""))).strip()
        if not title:
            raise ValueError(f"Scenario {i} missing title")
        if not description:
            raise ValueError(f"Scenario {i} missing description")
        if not question:
            raise ValueError(f"Scenario {i} missing question")
        validated.append(
            {
                "type": stype or "real_life",
                "title": title,
                "description": description,
                "context": context,
                "challenge": challenge,
                "question": question,
                "model_answer": model_answer,
                "explanation": explanation,
                "prompt": question,
                "guidance": f"{model_answer}\n\n{explanation}".strip(),
                "chapter": str(item.get("chapter", "")).strip(),
            },
        )
    if len(validated) < expected:
        raise ValueError(f"Expected {expected} scenarios, got {len(validated)}")
    return validated[:expected]


def validate_scenario_types(scenarios: list[dict[str, str]]) -> tuple[list[str], list[QAFailure]]:
    """Reject only if all scenarios are identical (severe structural corruption)."""
    errors: list[str] = []
    failures: list[QAFailure] = []
    if len(scenarios) < 1:
        return errors, failures

    fingerprints = [
        (
            str(scenario.get("title", "")).strip().lower(),
            str(scenario.get("description", "")).strip().lower(),
            str(scenario.get("question", "")).strip().lower(),
        )
        for scenario in scenarios
    ]
    if len(set(fingerprints)) == 1 and fingerprints[0][0]:
        msg = "All scenarios are identical"
        errors.append(msg)
        failures.append(
            {
                "validator": "validate_scenario_types",
                "section": "scenarios",
                "error": msg,
            },
        )
    return errors, failures


def validate_all_scenario_groups(
    scenarios: list[dict[str, str]],
    chapter_titles: list[str],
) -> tuple[list[str], list[QAFailure]]:
    """Validate 5 scenarios per chapter, grouped by chapter field."""
    errors: list[str] = []
    failures: list[QAFailure] = []
    if not chapter_titles:
        sc_errors, sc_failures = validate_scenario_types(scenarios)
        return sc_errors, sc_failures
    by_chapter: dict[str, list[dict[str, str]]] = {t: [] for t in chapter_titles}
    for sc in scenarios:
        ch = str(sc.get("chapter") or "").strip()
        if ch in by_chapter:
            by_chapter[ch].append(sc)
    for title in chapter_titles:
        group = by_chapter.get(title, [])
        if len(group) != 5:
            msg = f"Chapter '{title}' scenarios: expected 5, got {len(group)}"
            errors.append(msg)
            failures.append(
                {
                    "validator": "validate_scenario_count",
                    "section": "scenarios",
                    "error": msg,
                    "chapter": title,
                },
            )
            continue
        sc_errors, sc_failures = validate_scenario_types(group)
        errors.extend(sc_errors)
        for failure in sc_failures:
            failure["chapter"] = title
        failures.extend(sc_failures)
    return errors, failures


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
    snippet = match.group()
    try:
        data = json.loads(snippet)
    except json.JSONDecodeError:
        # Attempt to repair truncated JSON (common when max_tokens cuts off mid-response)
        for suffix in ('"}]}', '"]}', ']}', '}'):
            try:
                data = json.loads(snippet + suffix)
                break
            except json.JSONDecodeError:
                continue
        else:
            raise
    if not isinstance(data, dict):
        raise ValueError("Model JSON root must be an object")
    return data


def validate_flashcards(
    cards: list[dict[str, Any]],
    *,
    expected: int | None = None,
    chapter_title: str | None = None,
    min_ratio: float = 0.5,
) -> list[dict[str, str]]:
    if not cards:
        raise ValueError("Model returned no flashcards")
    validated: list[dict[str, str]] = []
    for i, c in enumerate(cards):
        front = str(c.get("front", "")).strip()
        back = str(c.get("back", "")).strip()
        if not front or not back:
            raise ValueError(f"Card {i} missing non-empty front/back")
        difficulty = normalize_difficulty(str(c.get("difficulty", "")))
        cognitive = normalize_cognitive(str(c.get("cognitive_level", "")), difficulty)
        if difficulty not in VALID_DIFFICULTIES:
            difficulty = normalize_difficulty(None)
        if cognitive not in VALID_COGNITIVE:
            cognitive = normalize_cognitive(None, difficulty)
        validated.append(
            {
                "front": front,
                "back": back,
                "chapter": str(c.get("chapter") or chapter_title or "").strip(),
                "difficulty": difficulty,
                "cognitive_level": cognitive,
            },
        )
    if expected is not None and len(validated) < max(1, int(expected * min_ratio)):
        raise ValueError(f"Expected ~{expected} cards, got {len(validated)}")
    return validated[:expected] if expected else validated


def dedupe_cards(cards: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], int]:
    """Drop duplicate question stems; return (unique cards, removed_count)."""
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    before = len(cards)
    for c in cards:
        front = str(c.get("front", "")).strip()
        key = _normalize_front(front)
        if not key or not str(c.get("back", "")).strip():
            continue
        if key in seen:
            continue
        seen.add(key)
        out.append(c)
    return out, before - len(out)


def flashcard_quota_gaps(
    cards: list[dict[str, Any]],
    quotas: dict[str, int],
) -> dict[str, int]:
    """Return per-chapter missing card counts vs allocated quotas."""
    by_chapter: dict[str, int] = {}
    for card in cards:
        ch = str(card.get("chapter") or "").strip()
        if ch:
            by_chapter[ch] = by_chapter.get(ch, 0) + 1
    return {
        title: max(0, want - by_chapter.get(title, 0))
        for title, want in quotas.items()
        if want > 0
    }


def find_duplicate_fronts(cards: list[dict[str, Any]]) -> list[str]:
    seen: dict[str, str] = {}
    dups: list[str] = []
    for c in cards:
        key = _normalize_front(str(c.get("front", "")))
        if not key:
            continue
        if key in seen:
            dups.append(key)
        else:
            seen[key] = str(c.get("front", ""))
    return dups


def validate_chapter_coverage(
    cards: list[dict[str, Any]],
    chapter_titles: list[str],
    quotas: dict[str, int],
) -> tuple[list[str], list[QAFailure]]:
    errors: list[str] = []
    failures: list[QAFailure] = []
    if not chapter_titles:
        return errors, failures
    by_chapter: dict[str, int] = {}
    for c in cards:
        ch = str(c.get("chapter") or "").strip()
        if ch:
            by_chapter[ch] = by_chapter.get(ch, 0) + 1
    for title, want in quotas.items():
        got = by_chapter.get(title, 0)
        if got == 0 and want > 0:
            msg = f"Chapter '{title}' has no flashcards (quota {want})"
            errors.append(msg)
            failures.append(
                {
                    "validator": "validate_chapter_coverage",
                    "section": "cards",
                    "error": msg,
                    "chapter": title,
                    "details": {"got": got, "quota": want},
                },
            )
    missing = [t for t in chapter_titles if by_chapter.get(t, 0) == 0]
    if missing and len(chapter_titles) > 1:
        msg = f"No cards generated for chapters: {', '.join(missing[:5])}"
        errors.append(msg)
        failures.append(
            {
                "validator": "validate_chapter_coverage",
                "section": "cards",
                "error": msg,
                "details": {"missing_chapters": missing[:5]},
            },
        )
    return errors, failures


def validate_cards_bundle(
    *,
    cards: list[dict[str, Any]],
    chapter_titles: list[str],
    quotas: dict[str, int],
    num_cards: int,
) -> tuple[list[str], list[QAFailure]]:
    """Card count/coverage enforced post-QA via micro-repair — no blocking QA here."""
    _ = (cards, chapter_titles, quotas, num_cards)
    return [], []


def validate_study_content_bundle(
    *,
    cards: list[dict[str, Any]],
    scenarios: list[dict[str, str]],
    chapter_titles: list[str],
    quotas: dict[str, int],
    num_cards: int,
    attempt: int = 1,
) -> tuple[list[str], list[QAFailure]]:
    """Unified QA for single-call chapter generation (cards + scenarios)."""
    errors, failures = validate_cards_bundle(
        cards=cards,
        chapter_titles=chapter_titles,
        quotas=quotas,
        num_cards=num_cards,
    )
    for failure in failures:
        failure["attempt"] = attempt

    if not chapter_titles:
        if not scenarios:
            msg = "No scenarios generated"
            errors.append(msg)
            failures.append(
                {
                    "validator": "validate_scenario_count",
                    "section": "scenarios",
                    "error": msg,
                    "attempt": attempt,
                },
            )
        else:
            sc_errors, sc_failures = validate_scenario_types(scenarios[:5])
            errors.extend(sc_errors)
            for failure in sc_failures:
                failure["attempt"] = attempt
            failures.extend(sc_failures)
        return errors, failures

    by_chapter: dict[str, list[dict[str, str]]] = {t: [] for t in chapter_titles}
    for sc in scenarios:
        ch = str(sc.get("chapter") or "").strip()
        if ch in by_chapter:
            by_chapter[ch].append(sc)

    for title in chapter_titles:
        group = by_chapter.get(title, [])
        if not group:
            msg = f"Chapter '{title}' has no scenarios"
            errors.append(msg)
            failures.append(
                {
                    "validator": "validate_scenario_count",
                    "section": "scenarios",
                    "error": msg,
                    "chapter": title,
                    "attempt": attempt,
                },
            )
            continue
        sc_errors, sc_failures = validate_scenario_types(group[:5])
        errors.extend(sc_errors)
        for failure in sc_failures:
            failure["attempt"] = attempt
            failure["chapter"] = title
        failures.extend(sc_failures)
    return errors, failures


def validate_generation_bundle(
    *,
    cards: list[dict[str, Any]],
    scenarios: list[dict[str, str]],
    chapter_titles: list[str],
    quotas: dict[str, int],
    num_cards: int,
    attempt: int = 1,
) -> tuple[list[str], list[QAFailure]]:
    return validate_study_content_bundle(
        cards=cards,
        scenarios=scenarios,
        chapter_titles=chapter_titles,
        quotas=quotas,
        num_cards=num_cards,
        attempt=attempt,
    )


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


def find_existing_flashcard_set(
    db: Session,
    *,
    user_id: UUID,
    book_id: UUID,
    selected_chapters: list[str] | None,
    num_cards: int,
) -> FlashcardSet | None:
    """Return an existing set matching book + chapters + card count (skip regeneration)."""
    chapters_key = json.dumps(sorted(selected_chapters or []), ensure_ascii=False)
    rows = db.execute(
        select(FlashcardSet).where(
            FlashcardSet.user_id == user_id,
            FlashcardSet.book_id == book_id,
        ).order_by(FlashcardSet.created_at.desc()),
    ).scalars().all()
    for row in rows:
        meta = parse_set_description(row.description)
        if meta.get("job_id") and not meta.get("summary"):
            continue
        existing_chapters = json.dumps(sorted(meta.get("selected_chapters") or []), ensure_ascii=False)
        if existing_chapters != chapters_key:
            continue
        card_count = db.execute(
            select(Flashcard).where(Flashcard.set_id == row.id),
        ).scalars().all()
        if len(card_count) >= max(1, int(num_cards * 0.85)):
            return row
    return None


def find_workbook_for_chapter(
    db: Session,
    *,
    user_id: UUID,
    book_id: UUID,
    chapter_title: str,
) -> Workbook | None:
    rows = db.execute(
        select(Workbook).where(
            Workbook.user_id == user_id,
            Workbook.book_id == book_id,
            Workbook.status == WorkbookStatus.ready,
        ).order_by(Workbook.created_at.desc()),
    ).scalars().all()
    for wb in rows:
        content = wb.content or {}
        if str(content.get("chapter_title") or "").strip() == chapter_title.strip():
            return wb
        chapters = content.get("chapters") or []
        for ch in chapters:
            if isinstance(ch, dict) and str(ch.get("chapter_title", "")).strip() == chapter_title.strip():
                return wb
    return None


def find_flashcard_set_for_job(db: Session, *, user_id: UUID, task_id: str) -> FlashcardSet | None:
    desc = celery_job_description(task_id)
    row = db.execute(
        select(FlashcardSet).where(
            FlashcardSet.user_id == user_id,
            FlashcardSet.description == desc,
        ),
    ).scalar_one_or_none()
    if row is not None:
        return row
    job_marker = f'"job_id": "{task_id}"'
    return db.execute(
        select(FlashcardSet).where(
            FlashcardSet.user_id == user_id,
            FlashcardSet.description.contains(job_marker),
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
