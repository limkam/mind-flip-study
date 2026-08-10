from types import SimpleNamespace

import pytest

import tasks.ai_tasks as ai_tasks
from ai_generation import build_set_description, parse_set_description


def _cards(count: int, chapter: str) -> list[dict[str, str]]:
    return [
        {"front": f"Question {index}", "back": f"Answer {index}", "chapter": chapter}
        for index in range(count)
    ]


def _scenarios(chapter: str) -> list[dict[str, str]]:
    return [
        {
            "type": "real_life",
            "title": f"Scenario {index}",
            "description": f"Description {index}",
            "question": f"Question {index}",
            "chapter": chapter,
        }
        for index in range(5)
    ]


@pytest.mark.parametrize("requested_cards", [5, 10, 15, 20])
def test_one_generation_workflow_produces_complete_atomic_bundle(monkeypatch, requested_cards):
    chapter = "Chapter 1"
    segment = SimpleNamespace(title=chapter, text="Source material", char_count=15, index=0)
    calls = {"study": 0, "scenarios": 0}

    def fake_study_content(**kwargs):
        calls["study"] += 1
        count = kwargs["num_cards"]
        return _cards(count, chapter), {"chapter": chapter, "summary": "Complete summary"}, []

    def fake_scenarios(**_kwargs):
        calls["scenarios"] += 1
        return _scenarios(chapter)

    monkeypatch.setattr(ai_tasks, "_generate_chapter_study_content", fake_study_content)
    monkeypatch.setattr(ai_tasks, "_generate_scenarios", fake_scenarios)
    monkeypatch.setattr(ai_tasks, "_update_job_progress", lambda *_args, **_kwargs: None)

    cards, scenarios, chapter_summaries = ai_tasks._run_chapter_generation(
        allocations=[(segment, requested_cards)],
        book_title="Test Book",
        user_id=SimpleNamespace(),
        celery_task_id="one-celery-job",
        generation_seed=7,
        book_id=None,
        qa_feedback="",
        qa_attempt=1,
        phase="generating_chapter_breakdown",
        total_chapters=1,
        start_pct=5,
        progress_span=82,
    )
    summary = chapter_summaries[0]["summary"]
    ai_tasks._assert_complete_generation_bundle(
        summary=summary,
        cards=cards,
        scenarios=scenarios,
        requested_cards=requested_cards,
    )

    assert len(cards) == requested_cards
    assert len(scenarios) == 5
    assert summary == "Complete summary"
    assert calls == {"study": 1, "scenarios": 1}

    stored = parse_set_description(
        build_set_description(
            summary=summary,
            job_id="one-celery-job",
            selected_chapters=[chapter],
            scenarios=scenarios,
            chapter_summaries=chapter_summaries,
        ),
    )
    assert len(stored["scenarios"]) == 5
    assert stored["job_id"] == "one-celery-job"


def test_incomplete_scenarios_block_persistence():
    with pytest.raises(ValueError, match="expected 5 scenarios, got 2"):
        ai_tasks._assert_complete_generation_bundle(
            summary="Summary",
            cards=_cards(5, "Chapter 1"),
            scenarios=_scenarios("Chapter 1")[:2],
            requested_cards=5,
        )


def test_incomplete_cards_block_persistence():
    with pytest.raises(ValueError, match="expected 10 cards, got 9"):
        ai_tasks._assert_complete_generation_bundle(
            summary="Summary",
            cards=_cards(9, "Chapter 1"),
            scenarios=_scenarios("Chapter 1"),
            requested_cards=10,
        )


def test_api_and_worker_pipeline_versions_must_match():
    ai_tasks._assert_generation_pipeline_version(ai_tasks.GENERATION_PIPELINE_VERSION)
    with pytest.raises(RuntimeError, match="worker version does not match"):
        ai_tasks._assert_generation_pipeline_version("older-worker")
