"""Bloom-aligned difficulty quotas and validation for generated learning content."""

from __future__ import annotations

from collections import Counter
from typing import Any

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


def validate_difficulty_mix(cards: list[dict[str, Any]], *, tolerance: float = 0.2) -> list[str]:
    errors: list[str] = []
    if not cards:
        return ["No flashcards to validate"]
    total = len(cards)
    counts = Counter(normalize_difficulty(c.get("difficulty")) for c in cards)
    targets = difficulty_quota(total)
    for level in (DIFFICULTY_EASY, DIFFICULTY_MEDIUM, DIFFICULTY_HARD):
        got = counts.get(level, 0)
        want = targets[level]
        if want == 0:
            continue
        if abs(got - want) / max(want, 1) > tolerance and total >= 6:
            errors.append(f"Difficulty mix off for {level}: got {got}, target ~{want}")
    return errors


def validate_cognitive_depth(cards: list[dict[str, Any]], *, tolerance: float = 0.2) -> list[str]:
    errors: list[str] = []
    if len(cards) < 6:
        return errors
    buckets = Counter(
        cognitive_bucket(normalize_cognitive(c.get("cognitive_level"), normalize_difficulty(c.get("difficulty"))))
        for c in cards
    )
    total = len(cards)
    targets = {"recall": 0.30, "application": 0.40, "analysis": 0.30}
    for bucket, target_pct in targets.items():
        got = buckets.get(bucket, 0) / total
        if abs(got - target_pct) > tolerance:
            errors.append(f"Cognitive depth off for {bucket}: {got:.0%} vs target {target_pct:.0%}")
    return errors
