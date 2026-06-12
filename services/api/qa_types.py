"""Structured QA failure types for generation observability and repair routing."""

from __future__ import annotations

from typing import Any, TypedDict


class QAFailure(TypedDict, total=False):
    attempt: int
    validator: str
    error: str
    section: str
    actual_distribution: dict[str, int]
    target_distribution: dict[str, int]
    actual_percentages: dict[str, float]
    chapter: str
    details: dict[str, Any]


CARD_VALIDATORS = frozenset(
    {
        "validate_difficulty_mix",
        "validate_cognitive_depth",
        "validate_card_count",
        "validate_chapter_coverage",
        "validate_definition_ratio",
        "validate_duplicate_fronts",
    },
)

SCENARIO_VALIDATORS = frozenset(
    {
        "validate_scenario_types",
        "validate_scenario_count",
    },
)

SUMMARY_VALIDATORS = frozenset(
    {
        "validate_summary",
    },
)


def classify_repair_sections(failures: list[QAFailure]) -> set[str]:
    """Return which content sections need repair based on failing validators."""
    sections: set[str] = set()
    for failure in failures:
        section = failure.get("section")
        if section:
            sections.add(section)
            continue
        validator = failure.get("validator", "")
        if validator in CARD_VALIDATORS:
            sections.add("cards")
        elif validator in SCENARIO_VALIDATORS:
            sections.add("scenarios")
        elif validator in SUMMARY_VALIDATORS:
            sections.add("summary")
        else:
            sections.add("full")
    if "full" in sections:
        return {"full"}
    return sections or {"full"}


def failures_to_messages(failures: list[QAFailure]) -> list[str]:
    return [str(f.get("error") or "") for f in failures if f.get("error")]
