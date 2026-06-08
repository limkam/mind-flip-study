"""Anthropic client factory — dev uses .env; production uses AWS Secrets Manager."""

from __future__ import annotations

import json
import logging

from anthropic import Anthropic

from config import settings

log = logging.getLogger(__name__)

CLAUDE_SONNET_MODEL = "claude-sonnet-4-6"

_api_key_cache: str | None = None
_client_cache: Anthropic | None = None


def parse_secret_string(raw: str) -> str:
    """
    Accept Secrets Manager payloads as plain text or JSON objects.

    Supported JSON shapes:
    - {"api_key": "..."}
    - {"ANTHROPIC_API_KEY": "..."}
    - {"secret": "..."}
    """
    text = (raw or "").strip()
    if not text:
        raise RuntimeError("Anthropic secret is empty")
    if not text.startswith("{"):
        return text
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        return text
    if isinstance(parsed, str):
        return parsed.strip()
    if isinstance(parsed, dict):
        for key in ("api_key", "ANTHROPIC_API_KEY", "secret", "value"):
            val = parsed.get(key)
            if isinstance(val, str) and val.strip():
                return val.strip()
    raise RuntimeError("Anthropic secret JSON did not contain a usable api_key field")


def _load_api_key_from_secrets_manager() -> str:
    import boto3

    client = boto3.client("secretsmanager", region_name=settings.AWS_SECRETS_REGION)
    resp = client.get_secret_value(SecretId=settings.ANTHROPIC_SECRET_ID)
    raw = resp.get("SecretString") or ""
    key = parse_secret_string(raw)
    log.info(
        "anthropic_secret_loaded",
        extra={"source": "aws_secrets_manager", "secret_id": settings.ANTHROPIC_SECRET_ID},
    )
    return key


def get_anthropic_api_key() -> str:
    global _api_key_cache
    if _api_key_cache:
        return _api_key_cache
    if settings.ENVIRONMENT == "production":
        _api_key_cache = _load_api_key_from_secrets_manager()
    else:
        _api_key_cache = (settings.ANTHROPIC_API_KEY or "").strip()
    if not _api_key_cache:
        raise RuntimeError("Anthropic API key is not configured")
    return _api_key_cache


def get_anthropic_client() -> Anthropic:
    global _client_cache
    if _client_cache is None:
        _client_cache = Anthropic(api_key=get_anthropic_api_key())
    return _client_cache
