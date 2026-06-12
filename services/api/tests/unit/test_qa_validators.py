"""QA validator unit tests — difficulty mix, cognitive depth, scenario types, card enforcement."""

import pytest

from ai_generation import (
    dedupe_cards,
    flashcard_quota_gaps,
    validate_scenario_types,
    validate_study_content_bundle,
)
from difficulty_engine import validate_cognitive_depth, validate_difficulty_mix
from qa_types import classify_repair_sections


def _cards(counts: dict[str, int], *, chapter: str = "Ch1") -> list[dict[str, str]]:
    cards: list[dict[str, str]] = []
    for level, n in counts.items():
        for _ in range(n):
            cards.append(
                {
                    "front": f"{level} question {len(cards)}",
                    "back": "answer",
                    "chapter": chapter,
                    "difficulty": level,
                    "cognitive_level": "apply",
                },
            )
    return cards


def test_difficulty_mix_allows_30_percent_tolerance():
    # 20 cards: target 6/8/6 — 7/6/7 should pass with 30% tolerance
    cards = _cards({"easy": 7, "medium": 6, "hard": 7})
    errors, failures = validate_difficulty_mix(cards, tolerance=0.3)
    assert errors == []
    assert failures == []


def test_difficulty_mix_rejects_large_imbalance():
    cards = _cards({"easy": 12, "medium": 4, "hard": 4})
    errors, failures = validate_difficulty_mix(cards, tolerance=0.3)
    assert errors
    assert failures[0]["validator"] == "validate_difficulty_mix"
    assert failures[0]["actual_distribution"]["easy"] == 12


def test_cognitive_depth_rejects_dominant_bucket():
    cards = [
        {
            "front": f"q{i}",
            "back": "a",
            "difficulty": "easy",
            "cognitive_level": "remember",
        }
        for i in range(15)
    ] + [
        {
            "front": f"q{i}",
            "back": "a",
            "difficulty": "medium",
            "cognitive_level": "apply",
        }
        for i in range(5)
    ]
    errors, _ = validate_cognitive_depth(cards)
    assert any("exceeds 70%" in e for e in errors)


def test_cognitive_depth_rejects_missing_bucket():
    cards = [
        {
            "front": f"q{i}",
            "back": "a",
            "difficulty": "easy",
            "cognitive_level": "remember",
        }
        for i in range(10)
    ] + [
        {
            "front": f"q{i}",
            "back": "a",
            "difficulty": "medium",
            "cognitive_level": "apply",
        }
        for i in range(10)
    ]
    errors, failures = validate_cognitive_depth(cards)
    assert any("missing entirely" in e for e in errors)
    assert failures[0]["validator"] == "validate_cognitive_depth"


def test_scenario_types_allows_reordered_types():
    types = ["professional", "real_life", "decision", "real_life", "decision"]
    scenarios = [
        {"type": t, "title": f"S{i}", "description": f"Desc {i}", "question": f"Q{i}"}
        for i, t in enumerate(types)
    ]
    errors, failures = validate_scenario_types(scenarios)
    assert errors == []
    assert failures == []


def test_scenario_types_rejects_all_identical():
    scenarios = [
        {"type": "real_life", "title": "Same", "description": "Same desc", "question": "Same q"}
        for _ in range(5)
    ]
    errors, failures = validate_scenario_types(scenarios)
    assert errors
    assert failures[0]["validator"] == "validate_scenario_types"


def test_scenario_types_allows_same_type_if_distinct():
    scenarios = [
        {"type": "real_life", "title": f"S{i}", "description": f"Desc {i}", "question": f"Q{i}"}
        for i in range(5)
    ]
    errors, failures = validate_scenario_types(scenarios)
    assert errors == []
    assert failures == []


def test_classify_repair_sections_cards_only():
    failures = [
        {"validator": "validate_difficulty_mix", "section": "cards", "error": "mix off"},
    ]
    assert classify_repair_sections(failures) == {"cards"}


def test_dedupe_cards_tracks_removed_count():
    cards = [
        {"front": "What is X?", "back": "a"},
        {"front": "What is X?", "back": "b"},
        {"front": "Define Y", "back": "c"},
        {"front": "", "back": "d"},
    ]
    unique, removed = dedupe_cards(cards)
    assert len(unique) == 2
    assert removed == 2


def test_flashcard_quota_gaps():
    cards = [
        {"front": "q1", "back": "a", "chapter": "Ch1"},
        {"front": "q2", "back": "a", "chapter": "Ch1"},
        {"front": "q3", "back": "a", "chapter": "Ch2"},
    ]
    gaps = flashcard_quota_gaps(cards, {"Ch1": 5, "Ch2": 3})
    assert gaps == {"Ch1": 3, "Ch2": 2}


def test_validate_study_content_bundle_ignores_card_count_shortfall():
    """Card count is enforced post-QA via micro-repair, not blocking QA."""
    cards = _cards({"easy": 8, "medium": 8, "hard": 0})[:17]
    scenarios = [
        {
            "type": "real_life",
            "title": f"S{i}",
            "description": f"Desc {i}",
            "question": f"Q{i}",
            "chapter": "Ch1",
        }
        for i in range(5)
    ]
    errors, failures = validate_study_content_bundle(
        cards=cards,
        scenarios=scenarios,
        chapter_titles=["Ch1"],
        quotas={"Ch1": 20},
        num_cards=20,
        attempt=1,
    )
    assert errors == []
    assert failures == []


def test_validate_study_content_bundle_ignores_difficulty_imbalance():
    """QA must not retry for minor distribution issues — only severe structural failures."""
    cards = _cards({"easy": 12, "medium": 4, "hard": 4})
    scenarios = [
        {
            "type": "real_life",
            "title": f"S{i}",
            "description": f"Desc {i}",
            "question": f"Q{i}",
            "chapter": "Ch1",
        }
        for i in range(5)
    ]
    errors, failures = validate_study_content_bundle(
        cards=cards,
        scenarios=scenarios,
        chapter_titles=["Ch1"],
        quotas={"Ch1": 20},
        num_cards=20,
        attempt=1,
    )
    assert errors == []
    assert failures == []


def test_validate_study_content_bundle_rejects_missing_scenarios():
    cards = _cards({"easy": 7, "medium": 7, "hard": 6})
    errors, failures = validate_study_content_bundle(
        cards=cards,
        scenarios=[],
        chapter_titles=["Ch1"],
        quotas={"Ch1": 20},
        num_cards=20,
        attempt=1,
    )
    assert errors
    assert any(f["validator"] == "validate_scenario_count" for f in failures)
