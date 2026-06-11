"""Centralized LLM prompt templates for learning content generation."""

from __future__ import annotations

from difficulty_engine import difficulty_mix_instruction

VARIATION_STYLES = [
    "Use situational 'which of the following…' framing.",
    "Use 'why does…' and 'how would…' question stems.",
    "Use mini case-study setups before each question.",
    "Use compare/contrast and 'best action' framing.",
    "Use problem-diagnosis and trade-off framing.",
    "Use real-world stakeholder perspectives (manager, patient, client, engineer).",
]

SCENARIO_TYPE_SPECS = [
    ("real_life", "Real-Life Application — everyday realistic situation applying concepts"),
    ("real_life", "Real-Life Application — practical challenge in daily or workplace context"),
    ("decision", "Decision-Making — learner must choose between plausible options/actions"),
    ("decision", "Decision-Making — evaluate alternatives and justify the best choice"),
    ("professional", "Professional Case Study — analyst/manager/consultant-level synthesis"),
]

FLASHCARD_SYSTEM = """You are an expert learning designer aligned with Bloom's Taxonomy.
Generate varied, non-repetitive flashcards that test understanding — not rote definitions.
Always respond with valid JSON only. No markdown fences, no preamble.
Required JSON:
{
  "flashcards": [
    {
      "front": "Question testing a specific concept",
      "back": "Complete, accurate answer",
      "difficulty": "easy|medium|hard",
      "cognitive_level": "remember|understand|apply|analyze|evaluate|create"
    }
  ]
}
Rules:
- Avoid duplicate or near-duplicate questions.
- Do NOT start every question with 'What is' or 'Define'.
- Use application, interpretation, analysis, and decision-making where appropriate.
- Match difficulty and cognitive_level to the requested mix.
- Stay grounded ONLY in the provided chapter text."""

CHAPTER_SUMMARY_SYSTEM = """You are an expert educator. Summarize one chapter/section clearly.
Respond with JSON only: {"summary": "...", "key_points": ["...", "..."]}"""

SCENARIO_SYSTEM = """You are an expert learning designer creating realistic study scenarios.
Respond with JSON only:
{
  "scenarios": [
    {
      "type": "real_life|decision|professional",
      "title": "Short title",
      "context": "Situation/context",
      "challenge": "Challenge, decision required, or problem statement",
      "question": "What should the learner do/analyze/decide?",
      "model_answer": "Strong model answer",
      "explanation": "Why this answer is strong; key concepts applied"
    }
  ]
}
Each scenario must be distinct, realistic, and require applying document concepts — not recall alone."""


def variation_instruction(style_index: int) -> str:
    return VARIATION_STYLES[style_index % len(VARIATION_STYLES)]


def flashcard_user_prompt(
    *,
    book_title: str,
    chapter_title: str,
    chapter_text: str,
    num_cards: int,
    difficulty_quota: dict[str, int],
    style_index: int,
    batch_note: str = "",
) -> str:
    mix = difficulty_mix_instruction(difficulty_quota)
    return (
        f'Generate exactly {num_cards} flashcards for chapter "{chapter_title}" from "{book_title}".\n'
        f"Difficulty mix: {mix}.\n"
        f"Cognitive target: ~30% recall, ~40% application, ~30% analysis.\n"
        f"Variation style: {variation_instruction(style_index)}.\n"
        f"{batch_note}\n"
        f"CHAPTER TEXT:\n{chapter_text}\n\n"
        "Respond with ONLY valid JSON for this chapter."
    )


def chapter_summary_user_prompt(*, book_title: str, chapter_title: str, chapter_text: str) -> str:
    return (
        f'Summarize chapter "{chapter_title}" from "{book_title}".\n'
        f"Include key_points (4-6 bullets).\n\n"
        f"TEXT:\n{chapter_text}\n\n"
        "JSON only."
    )


def scenarios_user_prompt(*, book_title: str, chapter_title: str, chapter_excerpt: str, seed_note: str) -> str:
    specs = "\n".join(
        f"{i + 1}. type={t} — {desc}" for i, (t, desc) in enumerate(SCENARIO_TYPE_SPECS)
    )
    return (
        f'Create exactly 5 scenarios for chapter "{chapter_title}" from "{book_title}" '
        f"following these specifications:\n"
        f"{specs}\n"
        f"Variation note: {seed_note}\n\n"
        f"CHAPTER EXCERPT:\n{chapter_excerpt}\n\n"
        "Respond with ONLY valid JSON containing exactly 5 scenarios."
    )


def single_scenario_user_prompt(
    *,
    book_title: str,
    chapter_title: str,
    chapter_excerpt: str,
    scenario_type: str,
    type_description: str,
    seed_note: str,
) -> str:
    return (
        f'Create exactly 1 scenario for chapter "{chapter_title}" from "{book_title}".\n'
        f"Required type: {scenario_type} — {type_description}\n"
        f"Variation note: {seed_note}\n\n"
        f"CHAPTER EXCERPT:\n{chapter_excerpt}\n\n"
        'Respond with ONLY valid JSON: {"scenarios": [{ ... one scenario ... }]}'
    )


def overview_summary_user_prompt(*, book_title: str, chapter_summaries: list[dict]) -> str:
    body = "\n\n".join(
        f"## {s.get('chapter', 'Section')}\n{s.get('summary', '')}" for s in chapter_summaries
    )
    return (
        f'Write a cohesive overview summary for "{book_title}" synthesizing ALL chapters below.\n'
        f"Do not focus on only one chapter.\n\n{body}\n\n"
        'Respond with JSON: {"summary": "..."}'
    )
