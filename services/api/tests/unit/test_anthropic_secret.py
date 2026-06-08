"""AWS Secrets Manager secret parsing."""

import pytest

from anthropic_client import parse_secret_string


def test_parse_plain_text_secret():
    assert parse_secret_string("sk-ant-plain-key") == "sk-ant-plain-key"


def test_parse_json_api_key():
    assert parse_secret_string('{"api_key":"json-key"}') == "json-key"


def test_parse_json_anthropic_api_key():
    assert parse_secret_string('{"ANTHROPIC_API_KEY":"env-style"}') == "env-style"


def test_parse_empty_raises():
    with pytest.raises(RuntimeError):
        parse_secret_string("   ")
