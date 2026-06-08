"""Token usage cost estimation and model constant."""

import pytest

from anthropic_client import CLAUDE_SONNET_MODEL
from token_usage_log import estimate_cost_usd


def test_claude_model_is_sonnet_4():
    assert CLAUDE_SONNET_MODEL == "claude-sonnet-4-20250514"


def test_estimate_cost_usd():
    cost = estimate_cost_usd(input_tokens=1000, output_tokens=1000)
    assert cost == pytest.approx(0.003 + 0.015, rel=1e-6)
