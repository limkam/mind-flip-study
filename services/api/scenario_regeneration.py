"""Regenerate scenario sets for an existing flashcard set."""

from __future__ import annotations

import time
from uuid import UUID

from ai_generation import build_set_description, parse_set_description, validate_scenarios
from generation_prompts import SCENARIO_SYSTEM, scenarios_user_prompt
from seeded_random import make_generation_seed
from tasks.ai_tasks import _anthropic_json_call


def chapter_text_from_meta(meta: dict, chapter_title: str) -> str:
    for item in meta.get("content_map") or []:
        if isinstance(item, dict) and str(item.get("title", "")).strip() == chapter_title:
            return str(item.get("text") or "")
    return ""


def chapter_titles_from_meta(meta: dict) -> list[str]:
    scenarios = meta.get("scenarios") or []
    ordered: list[str] = []
    seen: set[str] = set()
    for sc in scenarios:
        if not isinstance(sc, dict):
            continue
        title = str(sc.get("chapter") or "").strip()
        if title and title not in seen:
            seen.add(title)
            ordered.append(title)
    if ordered:
        return ordered
    selected = meta.get("selected_chapters") or []
    return [str(t).strip() for t in selected if str(t).strip()]


def regenerate_chapter_scenarios_sync(
    *,
    book_title: str,
    chapter_title: str,
    chapter_text: str,
    user_id: UUID,
    seed_suffix: str,
) -> list[dict[str, str]]:
    seed = make_generation_seed(
        user_id=str(user_id),
        book_id=chapter_title,
        job_id=f"regen-all-{seed_suffix}-{int(time.time())}",
    )
    seed_note = f"Regeneration #{seed % 997}. Produce a fresh set distinct from prior versions."
    data = _anthropic_json_call(
        system=SCENARIO_SYSTEM,
        user_content=scenarios_user_prompt(
            book_title=book_title,
            chapter_title=chapter_title,
            chapter_excerpt=chapter_text[:4000],
            seed_note=seed_note,
        ),
        max_tokens=4096,
        task="regenerate_scenarios",
        user_id=user_id,
        celery_task_id=f"regen-all-{user_id}-{chapter_title[:32]}",
    )
    scenarios_raw = data.get("scenarios") or []
    validated = validate_scenarios(scenarios_raw, expected=5)
    for sc in validated:
        sc["chapter"] = chapter_title
    return validated


def regenerate_all_scenarios_sync(
    *,
    book_title: str,
    meta: dict,
    user_id: UUID,
) -> list[dict[str, str]]:
    chapters = chapter_titles_from_meta(meta)
    if not chapters:
        raise ValueError("No chapters found for scenario regeneration")

    all_scenarios: list[dict[str, str]] = []
    for i, chapter_title in enumerate(chapters):
        chapter_text = chapter_text_from_meta(meta, chapter_title)
        if not chapter_text:
            raise ValueError(
                f"Chapter source text unavailable for '{chapter_title}'. "
                "Regenerate the full study set to enable scenario regeneration.",
            )
        all_scenarios.extend(
            regenerate_chapter_scenarios_sync(
                book_title=book_title,
                chapter_title=chapter_title,
                chapter_text=chapter_text,
                user_id=user_id,
                seed_suffix=f"{i}-{chapter_title[:16]}",
            ),
        )
    return all_scenarios


def replace_set_scenarios_in_description(description: str | None, scenarios: list[dict[str, str]]) -> str:
    meta = parse_set_description(description)
    return build_set_description(
        summary=str(meta.get("summary") or ""),
        job_id=str(meta.get("job_id") or ""),
        selected_chapters=list(meta.get("selected_chapters") or []),
        scenarios=scenarios,
        chapter_summaries=list(meta.get("chapter_summaries") or []),
        generation_seed=meta.get("generation_seed"),
        content_map=list(meta.get("content_map") or []),
    )
