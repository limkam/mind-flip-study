"""Versioned AI model prices and deterministic cost calculation."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date


@dataclass(frozen=True)
class ModelPrice:
    provider: str
    model_prefix: str
    effective_from: date
    input_per_million: float
    output_per_million: float
    cache_read_per_million: float
    cache_write_per_million: float


MODEL_PRICES = (
    ModelPrice("anthropic", "claude-haiku-4-5", date(2025, 10, 15), 1.0, 5.0, 0.10, 1.25),
    ModelPrice("anthropic", "claude-sonnet-4", date(2025, 5, 22), 3.0, 15.0, 0.30, 3.75),
)


def price_for_model(model: str, *, provider: str = "anthropic", on_date: date | None = None) -> ModelPrice:
    when = on_date or date.today()
    candidates = [p for p in MODEL_PRICES if p.provider == provider and model.startswith(p.model_prefix) and p.effective_from <= when]
    if not candidates:
        raise ValueError(f"No AI pricing configured for {provider}/{model}")
    return max(candidates, key=lambda p: p.effective_from)


def calculate_cost_usd(*, model: str, input_tokens: int, output_tokens: int,
                       cache_read_tokens: int = 0, cache_creation_tokens: int = 0,
                       provider: str = "anthropic", on_date: date | None = None) -> float:
    p = price_for_model(model, provider=provider, on_date=on_date)
    return (
        input_tokens * p.input_per_million
        + output_tokens * p.output_per_million
        + cache_read_tokens * p.cache_read_per_million
        + cache_creation_tokens * p.cache_write_per_million
    ) / 1_000_000
