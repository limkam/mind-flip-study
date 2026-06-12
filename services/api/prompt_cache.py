"""
Anthropic prompt caching helpers.

Implements explicit cache breakpoints per:
https://platform.claude.com/docs/en/build-with-claude/prompt-caching

Layout for chapter generation (tools → system → messages):
  1. Cached system prompt (shared across all chapters in a job)
  2. Cached chapter text block (reused when the same chapter gets multiple calls)
  3. Uncached per-call instructions (flashcard count, style, etc.)

Minimum cacheable prefix for Claude Sonnet on the Claude API is ~1024 tokens.
"""

from __future__ import annotations

from typing import Any

CACHE_CONTROL_EPHEMERAL = {"type": "ephemeral"}


def cached_system_block(text: str) -> list[dict[str, Any]]:
    """System prompt with an explicit ephemeral cache breakpoint."""
    return [
        {
            "type": "text",
            "text": text,
            "cache_control": CACHE_CONTROL_EPHEMERAL,
        },
    ]


def cached_user_message(*, cached_text: str, instruction: str) -> list[dict[str, Any]]:
    """
    User message with large repeated content cached first, instructions last.
    The cached block must precede uncached content for prefix hits on later calls.
    """
    blocks: list[dict[str, Any]] = []
    chapter = cached_text.strip()
    if chapter:
        blocks.append(
            {
                "type": "text",
                "text": f"CHAPTER TEXT:\n{chapter}",
                "cache_control": CACHE_CONTROL_EPHEMERAL,
            },
        )
    blocks.append({"type": "text", "text": instruction})
    return blocks


def extract_usage_tokens(usage: Any) -> tuple[int, int, int, int]:
    """Return input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens."""
    input_tokens = int(getattr(usage, "input_tokens", 0) or 0)
    output_tokens = int(getattr(usage, "output_tokens", 0) or 0)
    cache_read = int(getattr(usage, "cache_read_input_tokens", 0) or 0)
    cache_creation = int(getattr(usage, "cache_creation_input_tokens", 0) or 0)
    return input_tokens, output_tokens, cache_read, cache_creation
