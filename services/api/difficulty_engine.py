"""Bloom-aligned difficulty quotas and validation for generated learning content."""

from __future__ import annotations

from collections import Counter
from typing import Any

from qa_types import QAFailure

DIFFICULTY_EASY = "easy"
DIFFICULTY_MEDIUM = "medium"
DIFFICULTY_HARD = "hard"
VALID_DIFFICULTIES = frozenset({DIFFICULTY_EASY, DIFFICULTY_MEDIUM, DIFFICULTY_HARD})

# Bloom's taxonomy mapping
COGNITIVE_REMEMBER = "remember"
COGNITIVE_UNDERSTAND = "understand"
COGNITIVE_APPLY = "apply"
COGNITIVE_ANALYZE = "analyze"
COGNITIVE_EVALUATE = "evaluate"
COGNITIVE_CREATE = "create"
VALID_COGNITIVE = frozenset(
    {
        COGNITIVE_REMEMBER,
        COGNITIVE_UNDERSTAND,
        COGNITIVE_APPLY,
        COGNITIVE_ANALYZE,
        COGNITIVE_EVALUATE,
        COGNITIVE_CREATE,
    },
)

RECALL_LEVELS = frozenset({COGNITIVE_REMEMBER})
APPLICATION_LEVELS = frozenset({COGNITIVE_UNDERSTAND, COGNITIVE_APPLY})
ANALYSIS_LEVELS = frozenset({COGNITIVE_ANALYZE, COGNITIVE_EVALUATE, COGNITIVE_CREATE})

DIFFICULTY_TO_COGNITIVE = {
    DIFFICULTY_EASY: COGNITIVE_REMEMBER,
    DIFFICULTY_MEDIUM: COGNITIVE_APPLY,
    DIFFICULTY_HARD: COGNITIVE_ANALYZE,
}


def difficulty_quota(total: int) -> dict[str, int]:
    """30% easy, 40% medium, 30% hard."""
    if total <= 0:
        return {DIFFICULTY_EASY: 0, DIFFICULTY_MEDIUM: 0, DIFFICULTY_HARD: 0}
    if total == 1:
        return {DIFFICULTY_EASY: 0, DIFFICULTY_MEDIUM: 1, DIFFICULTY_HARD: 0}
    easy = max(0, round(total * 0.3))
    hard = max(0, round(total * 0.3))
    medium = max(0, total - easy - hard)
    while easy + medium + hard > total:
        if hard > easy:
            hard -= 1
        elif easy > 0:
            easy -= 1
        else:
            medium -= 1
    while easy + medium + hard < total:
        medium += 1
    return {DIFFICULTY_EASY: easy, DIFFICULTY_MEDIUM: medium, DIFFICULTY_HARD: hard}


def difficulty_mix_instruction(quota: dict[str, int]) -> str:
    parts = [f"{count} {level}" for level, count in quota.items() if count > 0]
    return ", ".join(parts)


def normalize_difficulty(value: str | None, *, default: str = DIFFICULTY_MEDIUM) -> str:
    v = (value or "").strip().lower()
    return v if v in VALID_DIFFICULTIES else default


def normalize_cognitive(value: str | None, difficulty: str) -> str:
    v = (value or "").strip().lower()
    if v in VALID_COGNITIVE:
        return v
    return DIFFICULTY_TO_COGNITIVE.get(difficulty, COGNITIVE_APPLY)


def cognitive_bucket(level: str) -> str:
    if level in RECALL_LEVELS:
        return "recall"
    if level in APPLICATION_LEVELS:
        return "application"
    if level in ANALYSIS_LEVELS:
        return "analysis"
    return "application"


def _difficulty_distribution(cards: list[dict[str, Any]]) -> dict[str, int]:
    counts = Counter(normalize_difficulty(c.get("difficulty")) for c in cards)
    return {
        DIFFICULTY_EASY: counts.get(DIFFICULTY_EASY, 0),
        DIFFICULTY_MEDIUM: counts.get(DIFFICULTY_MEDIUM, 0),
        DIFFICULTY_HARD: counts.get(DIFFICULTY_HARD, 0),
    }


def validate_difficulty_mix(
    cards: list[dict[str, Any]],
    *,
    tolerance: float = 0.3,
) -> tuple[list[str], list[QAFailure]]:
    """Allow ±30% deviation from target difficulty quota."""
    errors: list[str] = []
    failures: list[QAFailure] = []
    if not cards:
        msg = "No flashcards to validate"
        errors.append(msg)
        failures.append(
            {
                "validator": "validate_difficulty_mix",
                "section": "cards",
                "error": msg,
            },
        )
        return errors, failures

    total = len(cards)
    if total < 6:
        return errors, failures

    actual = _difficulty_distribution(cards)
    targets = difficulty_quota(total)
    off_levels: list[str] = []
    for level in (DIFFICULTY_EASY, DIFFICULTY_MEDIUM, DIFFICULTY_HARD):
        got = actual[level]
        want = targets[level]
        if want == 0:
            continue
        if abs(got - want) / max(want, 1) > tolerance:
            off_levels.append(f"{level}: got {got}, target ~{want}")

    if off_levels:
        msg = f"Expected balanced difficulty distribution ({'; '.join(off_levels)})"
        errors.append(msg)
        failures.append(
            {
                "validator": "validate_difficulty_mix",
                "section": "cards",
                "error": msg,
                "actual_distribution": actual,
                "target_distribution": targets,
            },
        )
    return errors, failures


def validate_cognitive_depth(cards: list[dict[str, Any]]) -> tuple[list[str], list[QAFailure]]:
    """Reject only if one bucket exceeds 70% or a bucket is missing entirely."""
    errors: list[str] = []
    failures: list[QAFailure] = []
    if len(cards) < 6:
        return errors, failures

    buckets = Counter(
        cognitive_bucket(normalize_cognitive(c.get("cognitive_level"), normalize_difficulty(c.get("difficulty"))))
        for c in cards
    )
    total = len(cards)
    percentages = {bucket: buckets.get(bucket, 0) / total for bucket in ("recall", "application", "analysis")}
    counts = {bucket: buckets.get(bucket, 0) for bucket in ("recall", "application", "analysis")}

    for bucket, pct in percentages.items():
        if pct > 0.70:
            msg = f"Cognitive depth: {bucket} exceeds 70% ({pct:.0%})"
            errors.append(msg)
            failures.append(
                {
                    "validator": "validate_cognitive_depth",
                    "section": "cards",
                    "error": msg,
                    "actual_percentages": percentages,
                    "actual_distribution": counts,
                },
            )

    for bucket, count in counts.items():
        if count == 0:
            msg = f"Cognitive depth: {bucket} category missing entirely"
            errors.append(msg)
            failures.append(
                {
                    "validator": "validate_cognitive_depth",
                    "section": "cards",
                    "error": msg,
                    "actual_percentages": percentages,
                    "actual_distribution": counts,
                },
            )
    return errors, failures
