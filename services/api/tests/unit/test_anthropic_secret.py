"""Anthropic API key resolution."""

from unittest.mock import patch

import pytest

from anthropic_client import get_anthropic_api_key, parse_secret_string, reset_anthropic_client_cache


def test_parse_plain_text_secret():
    assert parse_secret_string("sk-ant-plain-key") == "sk-ant-plain-key"


def test_parse_json_api_key():
    assert parse_secret_string('{"api_key":"json-key"}') == "json-key"


def test_env_key_used_before_secrets_manager():
    reset_anthropic_client_cache()
    with patch("anthropic_client.settings") as mock_settings:
        mock_settings.ANTHROPIC_API_KEY = "sk-ant-from-env"
        mock_settings.ENVIRONMENT = "production"
        assert get_anthropic_api_key() == "sk-ant-from-env"
    reset_anthropic_client_cache()


def test_missing_key_raises_clear_error():
    reset_anthropic_client_cache()
    with patch("anthropic_client.settings") as mock_settings:
        mock_settings.ANTHROPIC_API_KEY = ""
        mock_settings.ENVIRONMENT = "development"
        with pytest.raises(RuntimeError, match="ANTHROPIC_API_KEY"):
            get_anthropic_api_key()
    reset_anthropic_client_cache()
