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
    dedupe_cards,
    find_flashcard_set_for_job,
    mark_book_ai_finished,
    mark_book_ai_processing,
    parse_model_json,
    validate_flashcards,
    validate_scenarios,
    validate_study_content_bundle,
    _normalize_front,
)
from anthropic_client import CLAUDE_SONNET_MODEL, get_anthropic_client
from chapter_content import pdf_text_hash, persist_chapter_segments, resolve_chapter_segments
from chapter_distribution import allocate_card_quotas
from content_map import content_map_to_metadata
from database_sync import sync_session
from difficulty_engine import difficulty_quota
from generation_prompts import (
    CHAPTER_BREAKDOWN_SYSTEM,
    CHAPTER_SUMMARY_SYSTEM,
    FLASHCARD_MICRO_REPAIR_SYSTEM,
    FLASHCARD_SYSTEM,
    SCENARIO_SYSTEM,
    STUDY_CONTENT_SYSTEM,
    STUDY_OUTPUT_TOKEN_HARD_CAP,
    GENERATION_PIPELINE_VERSION,
    chapter_breakdown_user_prompt,
    flashcard_micro_repair_user_prompt,
    flashcard_repair_user_prompt,
    flashcard_user_prompt,
    overview_summary_user_prompt,
    scenario_repair_user_prompt,
    scenarios_user_prompt,
    study_content_user_prompt,
)
from job_cache import append_job_entries, cache_job, get_cached_job
from qa_types import QAFailure, classify_repair_sections
from models.book import Book
from models.flashcard import Flashcard, FlashcardSet
from models.quiz import StudyEvent
from prompt_cache import cached_system_block, cached_user_message, extract_usage_tokens
from s3_service import get_object_bytes
from seeded_random import make_generation_seed, pick_variation_style
from tasks.celery_app import celery
from token_usage_log import log_token_usage

log = logging.getLogger(__name__)

AI_CALL_MAX_ATTEMPTS = 3
QA_MAX_ATTEMPTS = 2
MICRO_REPAIR_MAX_RETRIES = 1
MICRO_REPAIR_MAX_OUTPUT_TOKENS = 300
CHAPTER_EXCERPT_JOIN_MAX = 12_000
MAX_CARDS_PER_STUDY_CALL = 50


def _update_job_progress(task_id: str, phase: str, **extra: Any) -> None:
    existing = get_cached_job(task_id) or {}
    prev_pct = existing.get("percent_complete")
    new_pct = extra.get("percent_complete")
    # Never roll the bar backward during an in-flight job (QA retry / Celery retry).
    if (
        isinstance(prev_pct, (int, float))
        and isinstance(new_pct, (int, float))
        and prev_pct > new_pct
        and phase not in ("completed", "failed")
    ):
        extra = {**extra, "percent_complete": int(prev_pct)}
    cache_job(task_id, {**existing, "status": "started", "phase": phase, **extra})


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


def _max_tokens_for_study_content(num_cards: int) -> int:
    """Hard cap 2200 output tokens — room for summary+scenarios+cards; micro-repair fills shortfalls."""
    return min(STUDY_OUTPUT_TOKEN_HARD_CAP, 650 + num_cards * 70)


def _max_tokens_for_cards(num_cards: int) -> int:
    """Flashcard-only repair/generation — compact output."""
    return min(STUDY_OUTPUT_TOKEN_HARD_CAP, 350 + num_cards * 42)


def _max_tokens_for_scenario_repair() -> int:
    return min(900, STUDY_OUTPUT_TOKEN_HARD_CAP)


def _max_tokens_for_micro_repair(missing: int) -> int:
    """Small patch call — target 150–300 output tokens."""
    return min(MICRO_REPAIR_MAX_OUTPUT_TOKENS, max(150, 60 + missing * 35))


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
    user_content: str | list[dict[str, Any]],
    max_tokens: int,
    task: str,
    user_id: UUID,
    celery_task_id: str,
    cache_chapter_text: str | None = None,
    book_id: UUID | None = None,
    feature_type: str | None = None,
    chapter_title: str | None = None,
    qa_attempt: int | None = None,
    repair_mode: str | None = None,
    validator_failure: str | None = None,
) -> dict[str, Any]:
    def _run() -> dict[str, Any]:
        client = get_anthropic_client()
        system_blocks = cached_system_block(system)
        if cache_chapter_text and isinstance(user_content, str):
            user_blocks = cached_user_message(cached_text=cache_chapter_text, instruction=user_content)
        elif isinstance(user_content, list):
            user_blocks = user_content
        else:
            user_blocks = [{"type": "text", "text": user_content}]

        started = time.perf_counter()
        message = client.messages.create(
            model=CLAUDE_SONNET_MODEL,
            max_tokens=max_tokens,
            cache_control={"type": "ephemeral"},
            system=system_blocks,
            messages=[{"role": "user", "content": user_blocks}],
        )
        duration_ms = int((time.perf_counter() - started) * 1000)
        usage = message.usage
        input_tokens, output_tokens, cache_read, cache_creation = extract_usage_tokens(usage)
        cached_tokens = cache_read + cache_creation
        call_metadata: dict[str, Any] = {
            "chapter": chapter_title,
            "attempt": qa_attempt,
            "duration_ms": duration_ms,
            "output_tokens": output_tokens,
            "cached_tokens": cached_tokens,
            "repair_mode": repair_mode,
            "validator_failure": validator_failure,
            "max_tokens_requested": max_tokens,
            "pipeline_version": GENERATION_PIPELINE_VERSION,
        }
        cost = log_token_usage(
            task=task,
            user_id=user_id,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cached_tokens=cached_tokens,
            cache_read_tokens=cache_read,
            cache_creation_tokens=cache_creation,
            duration_ms=duration_ms,
            celery_task_id=celery_task_id,
            book_id=book_id,
            feature_type=feature_type,
            call_metadata=call_metadata,
        )
        call_metadata["cost"] = round(cost, 6)
        append_job_entries(celery_task_id, "generation_metrics", [call_metadata])
        return parse_model_json(_extract_response_text(message))

    return _call_with_retry(_run, label=task)


def _chapter_summary_from_data(data: dict[str, Any], chapter_title: str) -> dict[str, Any]:
    summary = str(data.get("summary") or "").strip()
    overview = str(data.get("overview") or summary).strip()
    core_concept = str(data.get("core_concept") or "").strip()
    key_points = data.get("key_points") or []
    if not isinstance(key_points, list):
        key_points = []
    key_points = [str(k).strip() for k in key_points if str(k).strip()]
    watch_out = data.get("watch_out_for") or data.get("common_mistakes") or []
    if not isinstance(watch_out, list):
        watch_out = []
    watch_out = [str(w).strip() for w in watch_out if str(w).strip()]
    difficulty = str(data.get("difficulty") or "intermediate").strip().lower()
    key_concepts = data.get("key_concepts") or []
    if not summary and not overview:
        raise ValueError(f"Empty summary for chapter {chapter_title}")
    if not summary:
        summary = overview
    return {
        "chapter": chapter_title,
        "summary": summary,
        "overview": overview,
        "core_concept": core_concept,
        "key_points": key_points[:7] if key_points else [str(k.get("term", k)).strip() for k in key_concepts if k][:7],
        "watch_out_for": watch_out[:3],
        "common_mistakes": watch_out[:3],
        "difficulty": difficulty,
        "key_concepts": key_concepts,
    }


def _parse_scenarios_from_data(data: dict[str, Any], chapter_title: str) -> list[dict[str, str]]:
    scenarios_raw = data.get("scenarios") or []
    validated = validate_scenarios(scenarios_raw, expected=5)
    for sc in validated:
        sc["chapter"] = chapter_title
    return validated


def _generate_chapter_flashcards_only(
    *,
    book_title: str,
    chapter_title: str,
    chapter_text: str,
    num_cards: int,
    user_id: UUID,
    celery_task_id: str,
    generation_seed: int,
    batch_index: int,
    batch_offset: int,
    book_id: UUID | None = None,
    qa_feedback: str = "",
) -> list[dict[str, str]]:
    """Fallback flashcard-only batches when num_cards > MAX_CARDS_PER_STUDY_CALL (50)."""
    quota = difficulty_quota(num_cards)
    style = pick_variation_style(generation_seed, chapter_title, batch_index + batch_offset)
    note = f"Additional flashcards batch {batch_offset + 1}. {qa_feedback}".strip()
    instruction = flashcard_user_prompt(
        book_title=book_title,
        chapter_title=chapter_title,
        chapter_text="",
        num_cards=num_cards,
        difficulty_quota=quota,
        style_index=style,
        batch_note=note,
    )
    data = _anthropic_json_call(
        system=FLASHCARD_SYSTEM,
        user_content=instruction,
        max_tokens=_max_tokens_for_cards(num_cards),
        task="generate_flashcards",
        user_id=user_id,
        celery_task_id=celery_task_id,
        cache_chapter_text=chapter_text,
        book_id=book_id,
        feature_type="flashcards",
        chapter_title=chapter_title,
    )
    cards_raw = data.get("flashcards") or data.get("cards") or []
    cards = validate_flashcards(cards_raw, expected=num_cards, chapter_title=chapter_title)
    for card in cards:
        card["chapter"] = chapter_title
    return cards


def _generate_chapter_study_content_once(
    *,
    book_title: str,
    chapter_title: str,
    chapter_text: str,
    num_cards: int,
    user_id: UUID,
    celery_task_id: str,
    generation_seed: int,
    batch_index: int,
    book_id: UUID | None = None,
    qa_feedback: str = "",
) -> tuple[list[dict[str, str]], dict[str, Any], list[dict[str, str]]]:
    """Single Claude call: summary + scenarios + flashcards for one chapter."""
    quota = difficulty_quota(num_cards)
    style = pick_variation_style(generation_seed, chapter_title, batch_index)
    note = f"QA feedback from prior attempt: {qa_feedback}" if qa_feedback else ""
    instruction = study_content_user_prompt(
        book_title=book_title,
        chapter_title=chapter_title,
        num_cards=num_cards,
        difficulty_quota=quota,
        style_index=style,
        batch_note=note,
    )
    data = _anthropic_json_call(
        system=STUDY_CONTENT_SYSTEM,
        user_content=instruction,
        max_tokens=_max_tokens_for_study_content(num_cards),
        task="generate_study_content",
        user_id=user_id,
        celery_task_id=celery_task_id,
        cache_chapter_text=chapter_text,
        book_id=book_id,
        feature_type="flashcards",
        chapter_title=chapter_title,
        qa_attempt=1,
    )
    cards_raw = data.get("flashcards") or data.get("cards") or []
    cards = validate_flashcards(
        cards_raw,
        expected=None,
        chapter_title=chapter_title,
        allow_empty=True,
        skip_invalid=True,
    )
    if len(cards) < num_cards:
        log.warning(
            "partial_study_content_cards",
            extra={
                "celery_task_id": celery_task_id,
                "chapter": chapter_title,
                "got": len(cards),
                "expected": num_cards,
                "max_tokens": _max_tokens_for_study_content(num_cards),
            },
        )
    for card in cards:
        card["chapter"] = chapter_title
    chapter_summary = _chapter_summary_from_data(data, chapter_title)
    scenarios = _parse_scenarios_from_data(data, chapter_title)
    return cards, chapter_summary, scenarios


def _generate_chapter_summary_only(
    *,
    book_title: str,
    chapter_title: str,
    chapter_text: str,
    user_id: UUID,
    celery_task_id: str,
    book_id: UUID | None = None,
) -> dict[str, Any]:
    """Summary breakdown for chapters without flashcards in this set."""
    instruction = chapter_breakdown_user_prompt(book_title=book_title, chapter_title=chapter_title)
    data = _anthropic_json_call(
        system=CHAPTER_BREAKDOWN_SYSTEM,
        user_content=instruction,
        max_tokens=2048,
        task="generate_chapter_summary",
        user_id=user_id,
        celery_task_id=celery_task_id,
        cache_chapter_text=chapter_text,
        book_id=book_id,
        feature_type="summary",
    )
    return _chapter_summary_from_data(data, chapter_title)


def _generate_chapter_study_content(
    *,
    book_title: str,
    chapter_title: str,
    chapter_text: str,
    num_cards: int,
    user_id: UUID,
    celery_task_id: str,
    generation_seed: int,
    batch_index: int,
    book_id: UUID | None = None,
    qa_feedback: str = "",
) -> tuple[list[dict[str, str]], dict[str, Any], list[dict[str, str]]]:
    """One study-content API call for ≤50 cards; batch fallback only above that."""
    if num_cards <= MAX_CARDS_PER_STUDY_CALL:
        return _generate_chapter_study_content_once(
            book_title=book_title,
            chapter_title=chapter_title,
            chapter_text=chapter_text,
            num_cards=num_cards,
            user_id=user_id,
            celery_task_id=celery_task_id,
            generation_seed=generation_seed,
            batch_index=batch_index,
            book_id=book_id,
            qa_feedback=qa_feedback,
        )

    # Exceptional fallback: >50 cards — first call includes summary + scenarios + 50 cards.
    cards, chapter_summary, scenarios = _generate_chapter_study_content_once(
        book_title=book_title,
        chapter_title=chapter_title,
        chapter_text=chapter_text,
        num_cards=MAX_CARDS_PER_STUDY_CALL,
        user_id=user_id,
        celery_task_id=celery_task_id,
        generation_seed=generation_seed,
        batch_index=batch_index,
        book_id=book_id,
        qa_feedback=qa_feedback,
    )
    remaining = num_cards - MAX_CARDS_PER_STUDY_CALL
    batch_offset = 1
    batch_jobs: list[tuple[int, int]] = []
    while remaining > 0:
        batch_n = min(MAX_CARDS_PER_STUDY_CALL, remaining)
        batch_jobs.append((batch_n, batch_offset))
        remaining -= batch_n
        batch_offset += 1

    if batch_jobs:
        log.warning(
            "flashcard_batch_fallback",
            extra={"chapter": chapter_title, "total_cards": num_cards, "batches": len(batch_jobs)},
        )
        with ThreadPoolExecutor(max_workers=min(4, len(batch_jobs))) as pool:
            futures = [
                pool.submit(
                    _generate_chapter_flashcards_only,
                    book_title=book_title,
                    chapter_title=chapter_title,
                    chapter_text=chapter_text,
                    num_cards=batch_n,
                    user_id=user_id,
                    celery_task_id=celery_task_id,
                    generation_seed=generation_seed,
                    batch_index=batch_index,
                    batch_offset=off,
                    book_id=book_id,
                    qa_feedback=qa_feedback,
                )
                for batch_n, off in batch_jobs
            ]
            for fut in as_completed(futures):
                cards.extend(fut.result())
    return cards, chapter_summary, scenarios


def _generate_scenarios(
    *,
    book_title: str,
    chapter_title: str,
    chapter_text: str,
    user_id: UUID,
    celery_task_id: str,
    generation_seed: int,
    book_id: UUID | None = None,
    qa_feedback: str = "",
) -> list[dict[str, str]]:
    """Legacy standalone scenario call — not used in standard flashcard generation."""
    seed_note = f"Use variation profile #{generation_seed % 997}. {qa_feedback}".strip()
    instruction = scenarios_user_prompt(
        book_title=book_title,
        chapter_title=chapter_title,
        chapter_excerpt="",
        seed_note=seed_note,
    )
    data = _anthropic_json_call(
        system=SCENARIO_SYSTEM,
        user_content=instruction,
        max_tokens=4096,
        task="generate_scenarios",
        user_id=user_id,
        celery_task_id=celery_task_id,
        cache_chapter_text=chapter_text[:8000],
        book_id=book_id,
        feature_type="flashcards",
    )
    scenarios_raw = data.get("scenarios") or []
    validated = validate_scenarios(scenarios_raw, expected=5)
    for sc in validated:
        sc["chapter"] = chapter_title
    return validated


def _generate_overview_summary(
    *,
    book_title: str,
    chapter_summaries: list[dict[str, Any]],
    user_id: UUID,
    celery_task_id: str,
    book_id: UUID | None = None,
) -> str:
    data = _anthropic_json_call(
        system=CHAPTER_SUMMARY_SYSTEM,
        user_content=overview_summary_user_prompt(book_title=book_title, chapter_summaries=chapter_summaries),
        max_tokens=1800,
        task="generate_summary",
        user_id=user_id,
        celery_task_id=celery_task_id,
        book_id=book_id,
        feature_type="summary",
    )
    summary = str(data.get("summary", "")).strip()
    if not summary:
        raise ValueError("Model returned empty overview summary")
    return summary


def _synthesize_overview_summary(
    *,
    book_title: str,
    chapter_summaries: list[dict[str, Any]],
) -> str:
    """Build overview locally — avoids an extra slow LLM round-trip."""
    parts: list[str] = []
    for ch in chapter_summaries:
        title = str(ch.get("chapter") or "").strip()
        body = str(ch.get("overview") or ch.get("summary") or "").strip()
        if body:
            parts.append(f"{title}: {body}" if title else body)
    if parts:
        return "\n\n".join(parts[:6])
    return f"Study guide for {book_title}."


def _persist_qa_failures(celery_task_id: str, failures: list[QAFailure], attempt: int) -> None:
    enriched = [{**failure, "attempt": attempt} for failure in failures]
    append_job_entries(celery_task_id, "qa_failures", enriched)
    primary = enriched[0] if enriched else {}
    existing = get_cached_job(celery_task_id) or {}
    cache_job(
        celery_task_id,
        {
            **existing,
            "qa_status": "failed",
            "qa_failure_reason": primary.get("error"),
            "qa_failure_validator": primary.get("validator"),
            "qa_attempt": attempt,
        },
    )


def _repair_note_for_chapter(failures: list[QAFailure], chapter_title: str) -> str:
    notes: list[str] = []
    for failure in failures:
        ch = failure.get("chapter")
        if ch and ch != chapter_title:
            continue
        validator = failure.get("validator", "")
        error = failure.get("error", "")
        if validator == "validate_difficulty_mix":
            actual = failure.get("actual_distribution") or {}
            target = failure.get("target_distribution") or {}
            deltas: list[str] = []
            for level in ("easy", "medium", "hard"):
                diff = (target.get(level) or 0) - (actual.get(level) or 0)
                if diff > 0:
                    deltas.append(f"{diff} more {level}")
                elif diff < 0:
                    deltas.append(f"{abs(diff)} fewer {level}")
            if deltas:
                notes.append(f"Adjust difficulty mix: {', '.join(deltas)}.")
            else:
                notes.append(error)
        else:
            notes.append(error)
    return " ".join(n for n in notes if n).strip() or "Fix QA issues in flashcards."


def _log_flashcard_repair_event(
    celery_task_id: str,
    *,
    requested: int,
    initial: int,
    repaired: int,
    extra_api_calls: int,
    chapter: str | None = None,
    dedupe_removed: int = 0,
) -> None:
    event: dict[str, Any] = {
        "event": "flashcard_repair",
        "requested": requested,
        "initial": initial,
        "repaired": repaired,
        "extra_api_calls": extra_api_calls,
        "dedupe_removed": dedupe_removed,
    }
    if chapter:
        event["chapter"] = chapter
    append_job_entries(celery_task_id, "flashcard_repairs", [event])
    log.info("flashcard_repair", extra={**event, "celery_task_id": celery_task_id})


def _micro_repair_chapter_cards(
    *,
    book_title: str,
    chapter_title: str,
    chapter_text: str,
    missing_count: int,
    existing_cards: list[dict[str, str]],
    user_id: UUID,
    celery_task_id: str,
    book_id: UUID | None,
) -> list[dict[str, str]]:
    """Generate ONLY missing N flashcards — lightweight patch, no full chapter regen."""
    if missing_count <= 0:
        return []
    quota = difficulty_quota(missing_count)
    existing_fronts = [str(c.get("front", "")) for c in existing_cards if c.get("front")]
    instruction = flashcard_micro_repair_user_prompt(
        book_title=book_title,
        chapter_title=chapter_title,
        missing_count=missing_count,
        existing_fronts=existing_fronts,
        difficulty_quota=quota,
    )
    data = _anthropic_json_call(
        system=FLASHCARD_MICRO_REPAIR_SYSTEM,
        user_content=instruction,
        max_tokens=_max_tokens_for_micro_repair(missing_count),
        task="micro_repair_flashcards",
        user_id=user_id,
        celery_task_id=celery_task_id,
        cache_chapter_text=chapter_text,
        book_id=book_id,
        feature_type="flashcards",
        chapter_title=chapter_title,
        repair_mode="micro_cards",
        validator_failure="card_count",
    )
    cards_raw = data.get("flashcards") or data.get("cards") or []
    try:
        cards = validate_flashcards(
            cards_raw,
            expected=missing_count,
            chapter_title=chapter_title,
            min_ratio=0.0 if missing_count <= 2 else 0.25,
            allow_empty=True,
            skip_invalid=True,
        )
    except ValueError:
        cards = []
    seen = {_normalize_front(str(c.get("front", ""))) for c in existing_cards}
    out: list[dict[str, str]] = []
    for card in cards:
        key = _normalize_front(str(card.get("front", "")))
        if not key or key in seen:
            continue
        seen.add(key)
        card["chapter"] = chapter_title
        out.append(card)
        if len(out) >= missing_count:
            break
    return out


def _cards_for_chapter(cards: list[dict[str, str]], chapter_title: str) -> list[dict[str, str]]:
    return [c for c in cards if str(c.get("chapter") or "").strip() == chapter_title]


def _enforce_flashcard_counts(
    *,
    cards: list[dict[str, str]],
    allocations: list[tuple[Any, int]],
    book_title: str,
    num_cards: int,
    user_id: UUID,
    celery_task_id: str,
    book_id: UUID | None,
) -> list[dict[str, str]]:
    """Post-QA deterministic enforcement — micro-repair only, never full chapter regen."""
    initial_total = len(cards)
    cards, dedupe_removed = dedupe_cards(cards)
    quotas = {seg.title: quota for seg, quota in allocations if quota > 0}
    seg_by_title = {seg.title: seg for seg, _ in allocations}
    extra_api_calls = 0
    total_repaired = 0

    by_chapter: dict[str, list[dict[str, str]]] = {title: _cards_for_chapter(cards, title) for title in quotas}

    for title, want in quotas.items():
        chapter_cards = by_chapter.get(title, [])
        chapter_cards, ch_dedupe_removed = dedupe_cards(chapter_cards)
        dedupe_removed += ch_dedupe_removed
        missing = want - len(chapter_cards)

        for attempt in range(MICRO_REPAIR_MAX_RETRIES + 1):
            if missing <= 0:
                break
            seg = seg_by_title[title]
            patched = _micro_repair_chapter_cards(
                book_title=book_title,
                chapter_title=title,
                chapter_text=seg.text,
                missing_count=missing,
                existing_cards=chapter_cards,
                user_id=user_id,
                celery_task_id=celery_task_id,
                book_id=book_id,
            )
            extra_api_calls += 1
            total_repaired += len(patched)
            chapter_cards.extend(patched)
            chapter_cards, _ = dedupe_cards(chapter_cards)
            missing = want - len(chapter_cards)
            if not patched and attempt >= MICRO_REPAIR_MAX_RETRIES:
                break

        if len(chapter_cards) < want:
            raise ValueError(
                f"Flashcard count enforcement failed for '{title}': "
                f"got {len(chapter_cards)}, need {want} after micro-repair",
            )
        by_chapter[title] = chapter_cards[:want]

    enforced: list[dict[str, str]] = []
    for seg, quota in allocations:
        if quota > 0:
            enforced.extend(by_chapter.get(seg.title, [])[:quota])

    if len(enforced) > num_cards:
        enforced = enforced[:num_cards]
    elif len(enforced) < num_cards:
        gap = num_cards - len(enforced)
        largest = max(
            ((t, q) for t, q in quotas.items()),
            key=lambda x: x[1],
            default=(None, 0),
        )
        if largest[0]:
            seg = seg_by_title[largest[0]]
            for attempt in range(MICRO_REPAIR_MAX_RETRIES + 1):
                if gap <= 0:
                    break
                patched = _micro_repair_chapter_cards(
                    book_title=book_title,
                    chapter_title=largest[0],
                    chapter_text=seg.text,
                    missing_count=gap,
                    existing_cards=enforced,
                    user_id=user_id,
                    celery_task_id=celery_task_id,
                    book_id=book_id,
                )
                extra_api_calls += 1
                total_repaired += len(patched)
                for card in patched:
                    card["chapter"] = largest[0]
                enforced.extend(patched)
                enforced, _ = dedupe_cards(enforced)
                gap = num_cards - len(enforced)
                if not patched:
                    break
        if len(enforced) < num_cards:
            raise ValueError(
                f"Flashcard count enforcement failed: got {len(enforced)}/{num_cards} after micro-repair",
            )

    if dedupe_removed or total_repaired or initial_total != len(enforced):
        _log_flashcard_repair_event(
            celery_task_id,
            requested=num_cards,
            initial=initial_total,
            repaired=total_repaired,
            extra_api_calls=extra_api_calls,
            dedupe_removed=dedupe_removed,
        )

    return enforced[:num_cards]


def _repair_chapter_flashcards(
    *,
    book_title: str,
    chapter_title: str,
    chapter_text: str,
    num_cards: int,
    user_id: UUID,
    celery_task_id: str,
    book_id: UUID | None,
    qa_failures: list[QAFailure],
    qa_attempt: int,
) -> list[dict[str, str]]:
    quota = difficulty_quota(num_cards)
    repair_note = _repair_note_for_chapter(qa_failures, chapter_title)
    primary_validator = next(
        (f.get("validator") for f in qa_failures if not f.get("chapter") or f.get("chapter") == chapter_title),
        None,
    )
    instruction = flashcard_repair_user_prompt(
        book_title=book_title,
        chapter_title=chapter_title,
        num_cards=num_cards,
        difficulty_quota=quota,
        repair_note=repair_note,
    )
    data = _anthropic_json_call(
        system=FLASHCARD_SYSTEM,
        user_content=instruction,
        max_tokens=_max_tokens_for_cards(num_cards),
        task="repair_flashcards",
        user_id=user_id,
        celery_task_id=celery_task_id,
        cache_chapter_text=chapter_text,
        book_id=book_id,
        feature_type="flashcards",
        chapter_title=chapter_title,
        qa_attempt=qa_attempt,
        repair_mode="cards",
        validator_failure=primary_validator,
    )
    cards_raw = data.get("flashcards") or data.get("cards") or []
    cards = validate_flashcards(cards_raw, expected=num_cards, chapter_title=chapter_title)
    for card in cards:
        card["chapter"] = chapter_title
    return cards


def _repair_chapter_scenarios(
    *,
    book_title: str,
    chapter_title: str,
    chapter_text: str,
    user_id: UUID,
    celery_task_id: str,
    book_id: UUID | None,
    qa_failures: list[QAFailure],
    qa_attempt: int,
) -> list[dict[str, str]]:
    repair_note = _repair_note_for_chapter(qa_failures, chapter_title)
    primary_validator = next(
        (f.get("validator") for f in qa_failures if f.get("chapter") in (None, chapter_title)),
        None,
    )
    instruction = scenario_repair_user_prompt(
        book_title=book_title,
        chapter_title=chapter_title,
        repair_note=repair_note,
    )
    data = _anthropic_json_call(
        system=SCENARIO_SYSTEM,
        user_content=instruction,
        max_tokens=_max_tokens_for_scenario_repair(),
        task="repair_scenarios",
        user_id=user_id,
        celery_task_id=celery_task_id,
        cache_chapter_text=chapter_text[:8000],
        book_id=book_id,
        feature_type="flashcards",
        chapter_title=chapter_title,
        qa_attempt=qa_attempt,
        repair_mode="scenarios",
        validator_failure=primary_validator,
    )
    return _parse_scenarios_from_data(data, chapter_title)


def _run_chapter_generation(
    *,
    allocations: list[tuple[Any, int]],
    book_title: str,
    user_id: UUID,
    celery_task_id: str,
    generation_seed: int,
    book_id: UUID | None,
    qa_feedback: str,
    qa_attempt: int,
    phase: str,
    total_chapters: int,
    start_pct: int,
    progress_span: int,
) -> tuple[list[dict[str, str]], list[dict[str, str]], list[dict[str, Any]]]:
    all_cards: list[dict[str, str]] = []
    all_scenarios: list[dict[str, str]] = []
    chapter_summaries: list[dict[str, Any]] = []
    chapters_done = 0

    _update_job_progress(
        celery_task_id,
        phase,
        chapters_total=total_chapters,
        chapters_done=0,
        percent_complete=start_pct,
        qa_attempt=qa_attempt if qa_attempt > 1 else None,
    )

    with ThreadPoolExecutor(max_workers=min(6, total_chapters + 1)) as pool:
        study_futures = {
            pool.submit(
                _generate_chapter_study_content,
                book_title=book_title,
                chapter_title=seg.title,
                chapter_text=seg.text,
                num_cards=quota,
                user_id=user_id,
                celery_task_id=celery_task_id,
                generation_seed=generation_seed,
                batch_index=i,
                book_id=book_id,
                qa_feedback=qa_feedback,
            ): seg.title
            for i, (seg, quota) in enumerate(allocations)
            if quota > 0
        }

        for fut in as_completed(study_futures):
            cards, ch_summary, scenarios = fut.result()
            all_cards.extend(cards)
            all_scenarios.extend(scenarios)
            chapter_summaries.append(ch_summary)
            chapters_done += 1
            pct = min(92, start_pct + int((chapters_done / max(total_chapters, 1)) * progress_span))
            _update_job_progress(
                celery_task_id,
                phase,
                chapters_total=total_chapters,
                chapters_done=chapters_done,
                percent_complete=pct,
                current_chapter=study_futures[fut],
            )

    return all_cards, all_scenarios, chapter_summaries


def _repair_cards_for_allocations(
    *,
    allocations: list[tuple[Any, int]],
    book_title: str,
    user_id: UUID,
    celery_task_id: str,
    book_id: UUID | None,
    qa_failures: list[QAFailure],
    qa_attempt: int,
    existing_cards: list[dict[str, str]],
) -> list[dict[str, str]]:
    repair_chapters = {
        f.get("chapter")
        for f in qa_failures
        if f.get("section") == "cards" and f.get("chapter")
    }
    card_chapters = {seg.title for seg, quota in allocations if quota > 0}
    if not repair_chapters:
        repair_chapters = card_chapters

    kept = [c for c in existing_cards if str(c.get("chapter") or "") not in repair_chapters]
    repaired: list[dict[str, str]] = []

    with ThreadPoolExecutor(max_workers=min(6, len(repair_chapters) or 1)) as pool:
        futures = {
            pool.submit(
                _repair_chapter_flashcards,
                book_title=book_title,
                chapter_title=seg.title,
                chapter_text=seg.text,
                num_cards=quota,
                user_id=user_id,
                celery_task_id=celery_task_id,
                book_id=book_id,
                qa_failures=qa_failures,
                qa_attempt=qa_attempt,
            ): seg.title
            for seg, quota in allocations
            if quota > 0 and seg.title in repair_chapters
        }
        for fut in as_completed(futures):
            repaired.extend(fut.result())

    return kept + repaired


def _repair_scenarios_for_allocations(
    *,
    allocations: list[tuple[Any, int]],
    book_title: str,
    user_id: UUID,
    celery_task_id: str,
    book_id: UUID | None,
    qa_failures: list[QAFailure],
    qa_attempt: int,
    existing_scenarios: list[dict[str, str]],
) -> list[dict[str, str]]:
    repair_chapters = {
        f.get("chapter")
        for f in qa_failures
        if f.get("section") == "scenarios" and f.get("chapter")
    }
    scenario_chapters = {seg.title for seg, _ in allocations}
    if not repair_chapters:
        repair_chapters = scenario_chapters

    kept = [s for s in existing_scenarios if str(s.get("chapter") or "") not in repair_chapters]
    repaired: list[dict[str, str]] = []

    with ThreadPoolExecutor(max_workers=min(6, len(repair_chapters) or 1)) as pool:
        futures = {
            pool.submit(
                _repair_chapter_scenarios,
                book_title=book_title,
                chapter_title=seg.title,
                chapter_text=seg.text,
                user_id=user_id,
                celery_task_id=celery_task_id,
                book_id=book_id,
                qa_failures=qa_failures,
                qa_attempt=qa_attempt,
            ): seg.title
            for seg, _ in allocations
            if seg.title in repair_chapters
        }
        for fut in as_completed(futures):
            repaired.extend(fut.result())

    return kept + repaired


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
    book_extras: dict[str, Any] | None = None,
    book_id: UUID | None = None,
) -> tuple[str, list[dict[str, str]], list[dict[str, str]], list[dict[str, Any]], list[Any]]:
    segments = resolve_chapter_segments(
        full_text=full_text,
        toc_titles=toc_titles,
        selected=selected_chapters,
        extras=book_extras,
    )
    if not segments:
        raise ValueError("Could not build content map from document")

    allocations = allocate_card_quotas(num_cards, segments)
    chapter_titles = [seg.title for seg, _ in allocations]
    quotas = {seg.title: quota for seg, quota in allocations}
    total_chapters = len(allocations)

    last_qa_errors: list[str] = []

    all_cards, all_scenarios, chapter_summaries = _run_chapter_generation(
        allocations=allocations,
        book_title=book_title,
        user_id=user_id,
        celery_task_id=celery_task_id,
        generation_seed=generation_seed,
        book_id=book_id,
        qa_feedback="",
        qa_attempt=1,
        phase="generating_chapter_breakdown",
        total_chapters=total_chapters,
        start_pct=5,
        progress_span=82,
    )
    chapter_summaries.sort(
        key=lambda s: chapter_titles.index(s["chapter"]) if s["chapter"] in chapter_titles else 999,
    )

    for qa_attempt in range(1, QA_MAX_ATTEMPTS + 1):
        all_cards, _dedupe_removed = dedupe_cards(all_cards)

        qa_errors, qa_failures = validate_study_content_bundle(
            cards=all_cards,
            scenarios=all_scenarios,
            chapter_titles=chapter_titles,
            quotas=quotas,
            num_cards=num_cards,
            attempt=qa_attempt,
        )
        if not qa_errors:
            existing = get_cached_job(celery_task_id) or {}
            cache_job(celery_task_id, {**existing, "qa_status": "passed", "qa_attempt": qa_attempt})
            break

        last_qa_errors = qa_errors
        _persist_qa_failures(celery_task_id, qa_failures, qa_attempt)
        log.warning(
            "generation_qa_failed",
            extra={
                "celery_task_id": celery_task_id,
                "attempt": qa_attempt,
                "errors": qa_errors,
                "failures": qa_failures,
                "validators": [f.get("validator") for f in qa_failures],
            },
        )

        if qa_attempt >= QA_MAX_ATTEMPTS:
            raise ValueError(
                f"Generation QA failed after {QA_MAX_ATTEMPTS} attempts: {'; '.join(last_qa_errors)}",
            )

        sections = classify_repair_sections(qa_failures)
        qa_feedback = "; ".join(qa_errors)
        _update_job_progress(
            celery_task_id,
            "repairing_content",
            percent_complete=88,
            qa_attempt=qa_attempt + 1,
            qa_failure_reason=qa_failures[0].get("error") if qa_failures else None,
            qa_failure_validator=qa_failures[0].get("validator") if qa_failures else None,
            repair_sections=sorted(sections),
        )

        if sections == {"full"} or "summary" in sections:
            all_cards, all_scenarios, chapter_summaries = _run_chapter_generation(
                allocations=allocations,
                book_title=book_title,
                user_id=user_id,
                celery_task_id=celery_task_id,
                generation_seed=generation_seed + qa_attempt,
                book_id=book_id,
                qa_feedback=qa_feedback,
                qa_attempt=qa_attempt + 1,
                phase="refining_content",
                total_chapters=total_chapters,
                start_pct=88,
                progress_span=6,
            )
        else:
            if "cards" in sections:
                all_cards = _repair_cards_for_allocations(
                    allocations=allocations,
                    book_title=book_title,
                    user_id=user_id,
                    celery_task_id=celery_task_id,
                    book_id=book_id,
                    qa_failures=qa_failures,
                    qa_attempt=qa_attempt + 1,
                    existing_cards=all_cards,
                )
            if "scenarios" in sections:
                all_scenarios = _repair_scenarios_for_allocations(
                    allocations=allocations,
                    book_title=book_title,
                    user_id=user_id,
                    celery_task_id=celery_task_id,
                    book_id=book_id,
                    qa_failures=qa_failures,
                    qa_attempt=qa_attempt + 1,
                    existing_scenarios=all_scenarios,
                )

        chapter_summaries.sort(
            key=lambda s: chapter_titles.index(s["chapter"]) if s["chapter"] in chapter_titles else 999,
        )

    trimmed = _enforce_flashcard_counts(
        cards=all_cards,
        allocations=allocations,
        book_title=book_title,
        num_cards=num_cards,
        user_id=user_id,
        celery_task_id=celery_task_id,
        book_id=book_id,
    )

    _update_job_progress(celery_task_id, "generating_summary", percent_complete=95)
    overview = _synthesize_overview_summary(book_title=book_title, chapter_summaries=chapter_summaries)

    log.info(
        "generation_complete",
        extra={
            "celery_task_id": celery_task_id,
            "task": "generate_study_content",
            "cards": len(trimmed),
            "chapters": len(chapter_titles),
            "scenarios": len(all_scenarios),
            "api_calls_per_chapter": 1,
        },
    )
    return overview, trimmed, all_scenarios, chapter_summaries, segments


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
        existing = get_cached_job(task_id) or {}
        cache_job(
            task_id,
            {
                **existing,
                "status": "started",
                "phase": "retrying",
                "error": str(exc)[:200],
                "percent_complete": existing.get("percent_complete", 85),
            },
        )
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

            if self.request.retries == 0:
                _update_job_progress(tid, "extracting_text", book_id=book_id, percent_complete=2)
            else:
                existing = get_cached_job(tid) or {}
                _update_job_progress(
                    tid,
                    "retrying",
                    book_id=book_id,
                    percent_complete=existing.get("percent_complete", 85),
                )
            book_extras = dict(book.extras or {})
            toc_titles = _toc_titles(book)
            cached_hash = book_extras.get("extracted_text_hash")
            cached_store = book_extras.get("chapter_content") or {}

            full_text = ""
            if cached_hash and cached_store and toc_titles:
                full_text = "\n\n".join(
                    str((cached_store.get(t) or {}).get("text") or "")
                    for t in toc_titles
                    if (cached_store.get(t) or {}).get("text")
                )
            if not full_text.strip():
                pdf_bytes = get_object_bytes(book.s3_key)
                full_text = _extract_pdf_text(pdf_bytes)
                if not full_text.strip():
                    raise ValueError("No extractable text from PDF")

            book_title = book.title

        summary, cards_data, scenarios, chapter_summaries, segments = _generate_study_content(
            book_title=book_title,
            full_text=full_text,
            toc_titles=toc_titles,
            selected_chapters=selected_chapters,
            num_cards=n_cards,
            user_id=uid,
            celery_task_id=tid,
            generation_seed=generation_seed,
            book_extras=book_extras,
            book_id=bid,
        )

        _update_job_progress(tid, "saving_content", book_id=book_id, percent_complete=95)

        with sync_session() as db:
            dup = find_flashcard_set_for_job(db, user_id=uid, task_id=tid)
            if dup is not None:
                sid = str(dup.id)
            else:
                book = db.execute(select(Book).where(Book.id == bid)).scalar_one()
                text_hash = pdf_text_hash(full_text)
                extras = persist_chapter_segments(dict(book.extras or {}), segments, text_hash=text_hash)
                book.extras = extras
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

        existing_job = get_cached_job(tid) or {}
        payload = {
            "status": "complete",
            "phase": "completed",
            "set_id": sid,
            "card_count": len(cards_data),
            "scenario_count": len(scenarios),
            "percent_complete": 100,
            "qa_status": existing_job.get("qa_status"),
            "qa_failures": existing_job.get("qa_failures"),
            "generation_metrics": existing_job.get("generation_metrics"),
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
