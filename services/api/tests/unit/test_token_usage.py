"""Token usage cost estimation and model constant."""

import pytest

from anthropic_client import CLAUDE_SONNET_MODEL
from token_usage_log import estimate_cost_usd


def test_claude_model_is_sonnet_4():
    assert CLAUDE_SONNET_MODEL == "claude-sonnet-4-6"


def test_estimate_cost_usd():
    cost = estimate_cost_usd(input_tokens=1000, output_tokens=1000)
    assert cost == pytest.approx(0.003 + 0.015, rel=1e-6)


def test_haiku_uses_model_specific_pricing():
    cost = estimate_cost_usd(input_tokens=1000, output_tokens=1000, model="claude-haiku-4-5")
    assert cost == pytest.approx(0.001 + 0.005, rel=1e-6)


def test_cache_tokens_are_separate_from_uncached_input():
    cost = estimate_cost_usd(input_tokens=1000, output_tokens=0, cache_read_tokens=1000,
                             model="claude-haiku-4-5")
    assert cost == pytest.approx(0.0011, rel=1e-6)
