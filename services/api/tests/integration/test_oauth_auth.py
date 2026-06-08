"""Unit tests for OAuth token helpers (nonce, audience-style checks)."""

from __future__ import annotations

import base64
import hashlib

import pytest

from services.oauth_auth import apple_nonce_matches_token_claim


def _apple_nonce_claim(raw_nonce: str) -> str:
    digest = hashlib.sha256(raw_nonce.encode("utf-8")).digest()
    return base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")


def test_apple_nonce_matches_base64url_claim() -> None:
    raw = "client-session-nonce-123"
    claim = _apple_nonce_claim(raw)
    assert apple_nonce_matches_token_claim(raw, claim)


def test_apple_nonce_rejects_wrong_raw() -> None:
    claim = _apple_nonce_claim("expected")
    assert not apple_nonce_matches_token_claim("wrong", claim)


def test_apple_nonce_accepts_padded_claim() -> None:
    raw = "n"
    digest = hashlib.sha256(raw.encode("utf-8")).digest()
    claim_padded = base64.urlsafe_b64encode(digest).decode("ascii")
    assert apple_nonce_matches_token_claim(raw, claim_padded)


@pytest.mark.parametrize("garbage", ["", "not-base64!!!", "a"])
def test_apple_nonce_rejects_malformed_claim(garbage: str) -> None:
    assert not apple_nonce_matches_token_claim("raw", garbage)
