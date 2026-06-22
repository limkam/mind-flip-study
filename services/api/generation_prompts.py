"""Centralized LLM prompt templates for learning content generation."""

from __future__ import annotations

from difficulty_engine import difficulty_mix_instruction

# Hard output token budget (enforced via prompt + max_tokens API cap)
STUDY_OUTPUT_TOKEN_HARD_CAP = 4096
STUDY_OUTPUT_TOKEN_TARGET = 2800
GENERATION_PIPELINE_VERSION = "2026-06-15-reliable-v1"

SUMMARY_DETAIL_LEVELS = ("brief", "standard", "in_depth")

SUMMARY_DETAIL_BUDGETS = {
    "brief": {
        "summary": "40–60 tokens max — high-level overview, key concepts only",
        "overview": "60–90 tokens max — fast review mode",
        "key_points": "exactly 4 one-sentence bullets",
        "watch_out_for": "exactly 2 one-sentence pitfalls",
        "key_points_count": 4,
        "watch_out_count": 2,
        "instruction": "BRIEF summary mode: concise, high-level, key concepts only. Fast review.",
        "tone": "Prioritize clarity and brevity. Keep every summary field short.",
        "output_target": 1200,
    },
    "standard": {
        "summary": "120–150 tokens max",
        "overview": "150–220 tokens max",
        "key_points": "exactly 7 one-sentence bullets",
        "watch_out_for": "exactly 3 one-sentence pitfalls",
        "key_points_count": 7,
        "watch_out_count": 3,
        "instruction": "STANDARD summary mode: balanced depth for regular study.",
        "tone": "Balanced depth — clear explanations without excessive length.",
        "output_target": 2800,
    },
    "in_depth": {
        "summary": "200–280 tokens max — detailed explanations with concrete examples",
        "overview": "250–350 tokens max — expanded concepts, connections, exam preparation focus",
        "key_points": "exactly 8 detailed bullet points (2 sentences each) with examples",
        "watch_out_for": "exactly 4 pitfalls with brief explanations of why students miss them",
        "key_points_count": 8,
        "watch_out_count": 4,
        "instruction": (
            "IN-DEPTH summary mode: write noticeably longer summary and overview than standard mode. "
            "Include concrete examples, cause-effect links, and exam-relevant framing."
        ),
        "tone": (
            "Prioritize depth and teaching value for summary/overview/key_points/watch_out_for. "
            "Use examples and connect ideas across the chapter. Flashcards stay concise."
        ),
        "output_target": 3800,
    },
}


def summary_detail_block(level: str = "standard") -> str:
    cfg = SUMMARY_DETAIL_BUDGETS.get(level, SUMMARY_DETAIL_BUDGETS["standard"])
    return (
        f"Summary detail level: {level.upper()}. {cfg['instruction']}\n"
        f"- summary ({cfg['summary']})\n"
        f"- overview ({cfg['overview']})\n"
        f"- {cfg['key_points']}\n"
        f"- {cfg['watch_out_for']}"
    )


def token_budget_block(level: str = "standard") -> str:
    cfg = SUMMARY_DETAIL_BUDGETS.get(level, SUMMARY_DETAIL_BUDGETS["standard"])
    return (
        "STRICT TOKEN BUDGETS (mandatory — responses exceeding limits will be rejected):\n"
        f"- summary: {cfg['summary']}\n"
        f"- overview: {cfg['overview']}\n"
        "- core_concept: 20–30 tokens max (1–2 sentences)\n"
        f"- {cfg['key_points']}, one short sentence each unless in-depth mode says otherwise\n"
        f"- {cfg['watch_out_for']}\n"
        "- scenarios (3–5): 40–60 tokens each, total ≤ 350 tokens\n"
        "- flashcards: question ≤ 12 words, answer ≤ 30 words, ~45 tokens each\n"
        "- TOTAL RESPONSE: honor the summary detail level above; shorten scenarios if needed to fit flashcards"
    )


def study_content_required_sections(level: str = "standard") -> str:
    cfg = SUMMARY_DETAIL_BUDGETS.get(level, SUMMARY_DETAIL_BUDGETS["standard"])
    return (
        "Required sections:\n"
        f"- summary ({cfg['summary']}) — distinct from overview\n"
        f"- overview ({cfg['overview']}) — do not repeat summary\n"
        "- core_concept (20–30 tokens)\n"
        "- difficulty (beginner|intermediate|advanced)\n"
        f"- key_points: {cfg['key_points']}\n"
        f"- watch_out_for: {cfg['watch_out_for']}\n"
        "- scenarios: exactly 5 compact scenarios (≤500 tokens total)"
    )


TOKEN_BUDGET_BLOCK = token_budget_block("standard")

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

FLASHCARD_SYSTEM = """You are a high-efficiency educational generator aligned with Bloom's Taxonomy.
Prioritize clarity and brevity over explanation depth.
Always respond with valid JSON only. No markdown fences, no preamble.

Rules:
- Question: direct and simple, ≤ 15 words. No multi-clause framing or long context.
- Answer: short factual explanation, ≤ 40 words (1–2 sentences max). No essay-style answers.
- Do NOT repeat ideas. Avoid filler words and academic verbosity.
- Avoid duplicate or near-duplicate questions.
- Do NOT start every question with 'What is' or 'Define'.
- Match difficulty and cognitive_level to the requested mix.
- Stay grounded ONLY in the provided chapter text.

Required JSON:
{
  "flashcards": [
    {
      "front": "Direct question (≤15 words)",
      "back": "Short answer (≤40 words)",
      "difficulty": "easy|medium|hard",
      "cognitive_level": "remember|understand|apply|analyze|evaluate|create"
    }
  ]
}"""

CHAPTER_SUMMARY_SYSTEM = """You are an expert educator. Summarize one chapter/section clearly.
Respond with JSON only: {"summary": "...", "key_points": ["...", "..."]}"""

CHAPTER_BREAKDOWN_SYSTEM = """You are an expert book tutor. Produce a rich chapter study breakdown (no flashcards).
Always respond with valid JSON only. No markdown fences, no preamble.
Required JSON:
{
  "difficulty": "beginner|intermediate|advanced",
  "summary": "2-3 paragraph structured explanation",
  "core_concept": "One-liner key idea",
  "overview": "One paragraph overview with context and implication",
  "key_points": ["up to 7 concise insights"],
  "watch_out_for": ["up to 3 pitfalls or misconceptions"]
}
Stay grounded ONLY in the provided chapter text."""

def study_output_token_target(level: str = "standard") -> int:
    cfg = SUMMARY_DETAIL_BUDGETS.get(level, SUMMARY_DETAIL_BUDGETS["standard"])
    return int(cfg.get("output_target", STUDY_OUTPUT_TOKEN_TARGET))


def study_content_system(level: str = "standard") -> str:
    cfg = SUMMARY_DETAIL_BUDGETS.get(level, SUMMARY_DETAIL_BUDGETS["standard"])
    kp = cfg["key_points_count"]
    wo = cfg["watch_out_count"]
    overview_style = (
        "Expanded teaching overview with examples and connections"
        if level == "in_depth"
        else "Context and implication — distinct from summary"
    )
    summary_style = (
        "Detailed structured explanation with examples"
        if level == "in_depth"
        else "Compact structured explanation"
    )
    return f"""You are an educational generator and study assistant.
{cfg["tone"]}
Generate complete chapter study content in ONE JSON response.
Always respond with valid JSON only. No markdown fences, no preamble.

Summary detail level for this request: {level.upper()}.
{cfg["instruction"]}

You must follow the token budgets for summary fields exactly as specified in the user message.
Flashcards and scenarios must stay concise regardless of detail level.

Style rules:
- Do NOT repeat ideas across sections (summary ≠ overview ≠ key_points ≠ scenarios ≠ flashcards).
- Each section must add NEW information — no verbatim repetition.
- Honor the requested summary detail level — in_depth must be visibly longer and richer than standard.

{token_budget_block(level)}

Required JSON:
{{
  "difficulty": "beginner|intermediate|advanced",
  "summary": "{summary_style}",
  "core_concept": "Key idea in 1–2 sentences",
  "overview": "{overview_style}",
  "key_points": ["exactly {kp} items per level budget"],
  "watch_out_for": ["exactly {wo} items per level budget"],
  "scenarios": [
    {{
      "type": "real_life|decision|professional",
      "title": "Max 6 words",
      "description": "2–3 sentences only (40–80 tokens). No narrative expansion.",
      "question": "Short decision/analysis prompt",
      "model_answer": "1–2 sentences max",
      "explanation": "1 sentence max — omit if redundant with model_answer"
    }}
  ],
  "flashcards": [
    {{
      "front": "Direct question (≤15 words)",
      "back": "Short answer (≤40 words)",
      "difficulty": "easy|medium|hard",
      "cognitive_level": "remember|understand|apply|analyze|evaluate|create"
    }}
  ]
}}
Rules:
- scenarios: 3–5 distinct, application-focused. Do NOT repeat chapter summary or key points.
- flashcards: exact count requested; direct questions; no repetition of scenario/summary text.
- key_points: exactly {kp}. watch_out_for: exactly {wo}.
- Stay grounded ONLY in the provided chapter text.
- If over budget: shorten flashcards and scenarios first, never compress in_depth summaries below their minimum budgets."""


STUDY_CONTENT_SYSTEM = study_content_system("standard")

SCENARIO_SYSTEM = """You are a high-efficiency educational generator creating compact study scenarios.
Prioritize clarity and brevity. Respond with JSON only.

Each scenario:
- title: max 6 words
- description: 2–3 sentences only (40–80 tokens). No long narrative.
- question: short and direct
- model_answer: 1–2 sentences max
- explanation: 1 sentence max (omit if redundant)

Do NOT repeat chapter summary content. Each scenario must add new application context.

{
  "scenarios": [
    {
      "type": "real_life|decision|professional",
      "title": "Short title",
      "description": "Compact situation (2–3 sentences)",
      "question": "What should the learner decide/analyze?",
      "model_answer": "Brief strong answer",
      "explanation": "One sentence rationale"
    }
  ]
}"""


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
    body = (
        f'Generate exactly {num_cards} flashcards for chapter "{chapter_title}" from "{book_title}".\n'
        f"Difficulty mix: {mix}.\n"
        f"Cognitive target: ~30% recall, ~40% application, ~30% analysis.\n"
        f"Variation style: {variation_instruction(style_index)}.\n"
        f"{batch_note}\n"
    )
    if chapter_text.strip():
        body += f"CHAPTER TEXT:\n{chapter_text}\n\n"
    return body + "Respond with ONLY valid JSON for this chapter."


def chapter_summary_user_prompt(*, book_title: str, chapter_title: str, chapter_text: str) -> str:
    return (
        f'Summarize chapter "{chapter_title}" from "{book_title}".\n'
        f"Include key_points (4-6 bullets).\n\n"
        f"TEXT:\n{chapter_text}\n\n"
        "JSON only."
    )


def chapter_breakdown_user_prompt(*, book_title: str, chapter_title: str) -> str:
    return (
        f'Produce a complete study breakdown for chapter "{chapter_title}" from "{book_title}".\n'
        "Include summary, core_concept, overview, key_points (up to 7), and watch_out_for (up to 3).\n"
        "Respond with ONLY valid compact JSON."
    )


def study_content_user_prompt(
    *,
    book_title: str,
    chapter_title: str,
    num_cards: int,
    difficulty_quota: dict[str, int],
    style_index: int,
    batch_note: str = "",
    summary_detail_level: str = "standard",
) -> str:
    mix = difficulty_mix_instruction(difficulty_quota)
    detail = summary_detail_block(summary_detail_level)
    scenario_specs = "\n".join(
        f"  {i + 1}. type={t} — {desc}" for i, (t, desc) in enumerate(SCENARIO_TYPE_SPECS)
    )
    return (
        f'Generate complete study content for chapter "{chapter_title}" from "{book_title}".\n'
        f"Return ONE compact JSON object. STRICT token budgets apply — total ≤ 2000 tokens.\n\n"
        f"{detail}\n\n"
        f"{token_budget_block(summary_detail_level)}\n\n"
        f"{study_content_required_sections(summary_detail_level)}\n"
        f"{scenario_specs}\n"
        f"  Each: title ≤6 words, description 2–3 sentences, no summary repetition\n"
        f"- flashcards: exactly {num_cards} cards (≤900 tokens total)\n"
        f"  Question ≤15 words. Answer ≤40 words. No essay answers.\n"
        f"Flashcard difficulty mix: {mix}.\n"
        f"Variation style: {variation_instruction(style_index)}.\n"
        f"Do not repeat content across sections. Prefer bullets over paragraphs.\n"
        f"{batch_note}\n"
        f"Respond with ONLY valid compact JSON. Target {study_output_token_target(summary_detail_level)} output tokens."
    )


def flashcard_repair_user_prompt(
    *,
    book_title: str,
    chapter_title: str,
    num_cards: int,
    difficulty_quota: dict[str, int],
    repair_note: str,
) -> str:
    mix = difficulty_mix_instruction(difficulty_quota)
    return (
        f'Repair flashcards ONLY for chapter "{chapter_title}" from "{book_title}".\n'
        f"Return ONLY a JSON object with a flashcards array — no summary, scenarios, or other fields.\n"
        f"Generate exactly {num_cards} flashcards.\n"
        f"Difficulty mix: {mix}.\n"
        f"Repair instructions: {repair_note}\n"
        "Question ≤15 words. Answer ≤40 words. Respond with ONLY valid compact JSON."
    )


FLASHCARD_MICRO_REPAIR_SYSTEM = """You are a high-efficiency flashcard generator.
Generate ONLY the requested number of NEW flashcards. Output must be minimal JSON.
Question ≤15 words. Answer ≤40 words. No preamble, no markdown.
Do NOT duplicate any existing questions provided in the prompt.
Required JSON: {"flashcards": [{"front": "...", "back": "...", "difficulty": "easy|medium|hard", "cognitive_level": "remember|understand|apply|analyze|evaluate|create"}]}"""


def flashcard_micro_repair_user_prompt(
    *,
    book_title: str,
    chapter_title: str,
    missing_count: int,
    existing_fronts: list[str],
    difficulty_quota: dict[str, int],
) -> str:
    mix = difficulty_mix_instruction(difficulty_quota)
    avoid = "\n".join(f"- {q}" for q in existing_fronts[:15]) if existing_fronts else "(none)"
    return (
        f'Generate exactly {missing_count} NEW flashcards for chapter "{chapter_title}" from "{book_title}".\n'
        f"Return ONLY JSON: {{\"flashcards\": [...]}} — no other fields.\n"
        f"Difficulty mix for these cards: {mix}.\n"
        f"Do NOT duplicate these existing questions:\n{avoid}\n"
        "Keep output minimal. Question ≤15 words. Answer ≤40 words."
    )


def scenario_repair_user_prompt(
    *,
    book_title: str,
    chapter_title: str,
    repair_note: str,
) -> str:
    scenario_specs = "\n".join(
        f"  {i + 1}. type={t} — {desc}" for i, (t, desc) in enumerate(SCENARIO_TYPE_SPECS)
    )
    return (
        f'Repair scenarios ONLY for chapter "{chapter_title}" from "{book_title}".\n'
        f"Return ONLY a JSON object with a scenarios array — no summary or flashcards.\n"
        f"Generate exactly 5 compact scenarios (title ≤6 words, 2–3 sentence descriptions):\n"
        f"{scenario_specs}\n"
        f"Repair instructions: {repair_note}\n"
        "Respond with ONLY valid compact JSON."
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
        + (f"CHAPTER EXCERPT:\n{chapter_excerpt}\n\n" if chapter_excerpt.strip() else "")
        + "Respond with ONLY valid JSON containing exactly 5 scenarios."
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
