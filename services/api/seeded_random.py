"""Deterministic pseudo-random helpers for reproducible but varied generation."""

from __future__ import annotations

import hashlib
import random
from typing import TypeVar

T = TypeVar("T")


def make_generation_seed(*, user_id: str, book_id: str, job_id: str) -> int:
    raw = f"{user_id}:{book_id}:{job_id}".encode()
    return int(hashlib.sha256(raw).hexdigest()[:12], 16)


def seeded_rng(seed: int, *salts: str) -> random.Random:
    payload = f"{seed}|{'|'.join(salts)}".encode()
    digest = hashlib.sha256(payload).hexdigest()
    return random.Random(int(digest[:16], 16))


def seeded_shuffle(seed: int, items: list[T], *, salt: str = "") -> list[T]:
    rng = seeded_rng(seed, salt)
    copy = list(items)
    rng.shuffle(copy)
    return copy


def pick_variation_style(seed: int, chapter: str, batch: int) -> int:
    return seeded_rng(seed, chapter, str(batch)).randint(0, 5)
