"""Allocate generation quotas proportionally across chapter segments."""

from __future__ import annotations

from content_map import ChapterSegment


def allocate_card_quotas(num_cards: int, segments: list[ChapterSegment]) -> list[tuple[ChapterSegment, int]]:
    if not segments or num_cards <= 0:
        return []
    n = len(segments)
    if num_cards < n:
        # At least one card for first N chapters
        return [(segments[i], 1 if i < num_cards else 0) for i in range(n) if i < num_cards]

    total_chars = sum(max(seg.char_count, 1) for seg in segments)
    raw = [max(1, round(num_cards * max(seg.char_count, 1) / total_chars)) for seg in segments]

    # Adjust to exact total
    while sum(raw) > num_cards:
        idx = raw.index(max(raw))
        if raw[idx] > 1:
            raw[idx] -= 1
        else:
            break
    while sum(raw) < num_cards:
        idx = max(range(n), key=lambda i: segments[i].char_count)
        raw[idx] += 1

    return [(segments[i], raw[i]) for i in range(n) if raw[i] > 0]
