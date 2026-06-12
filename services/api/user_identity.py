"""Resolve human-readable display names for leaderboards and social features."""

from __future__ import annotations


def resolve_display_name(*, full_name: str | None, email: str | None) -> str:
    """
    Prefer full_name, then email local-part (john@x.com → john), else 'Learner'.
    Never returns 'Anonymous' unless no identifier exists at all.
    """
    name = (full_name or "").strip()
    if name:
        return name

    addr = (email or "").strip().lower()
    if addr and "@" in addr:
        local = addr.split("@", 1)[0].strip()
        if local:
            cleaned = local.replace(".", " ").replace("_", " ").replace("-", " ")
            parts = [p for p in cleaned.split() if p]
            if parts:
                return " ".join(p.capitalize() for p in parts)
            return local

    return "Learner"
