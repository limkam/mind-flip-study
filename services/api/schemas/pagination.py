"""Shared helpers for paginated list responses."""

from __future__ import annotations


def total_pages(*, total: int, size: int) -> int:
    """Ceiling of total / size; 0 when total is 0."""
    if size <= 0:
        return 0
    if total <= 0:
        return 0
    return (total + size - 1) // size
