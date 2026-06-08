"""OAuth token verification (Google ID token, Apple identity token)."""

from __future__ import annotations

import base64
import hashlib
import time
from typing import Any

import jwt
from google.auth import exceptions as google_auth_exceptions
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from jwt import PyJWKClient

APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys"

_GOOGLE_ISSUERS = frozenset({"accounts.google.com", "https://accounts.google.com"})

# PyJWT caches the JWKS response per client instance; reuse one client process-wide
# so Apple public keys are not re-fetched on every request (default cache TTL 5 min, extended).
_apple_jwks_client: PyJWKClient | None = None
_google_verify_request: google_requests.Request | None = None


def _get_apple_jwks_client() -> PyJWKClient:
    global _apple_jwks_client
    if _apple_jwks_client is None:
        _apple_jwks_client = PyJWKClient(
            APPLE_JWKS_URL,
            cache_jwk_set=True,
            lifespan=3600.0,
            cache_keys=True,
            max_cached_keys=32,
        )
    return _apple_jwks_client


def _google_request() -> google_requests.Request:
    global _google_verify_request
    if _google_verify_request is None:
        _google_verify_request = google_requests.Request()
    return _google_verify_request


def apple_nonce_matches_token_claim(raw_nonce: str, token_nonce_claim: str) -> bool:
    """
    Apple places SHA256(raw_nonce) in the ID token's ``nonce`` claim, encoded as base64url
    (padding may vary). Compare by digest to avoid encoding mismatches.
    """
    try:
        claim = token_nonce_claim.strip()
        pad = "=" * (-len(claim) % 4)
        from_claim = base64.urlsafe_b64decode((claim + pad).encode("ascii"))
    except (ValueError, UnicodeEncodeError):
        return False
    expected = hashlib.sha256(raw_nonce.encode("utf-8")).digest()
    return from_claim == expected


def verify_google_id_token(raw_token: str, client_id: str) -> dict[str, Any]:
    """
    Validate a Google Sign-In ID token.

    Uses ``google.oauth2.id_token.verify_oauth2_token`` (signature, ``exp`` / ``iat`` with
    skew, ``aud`` against Google's certs). Adds defense-in-depth:

    - ``aud`` must be exactly ``client_id`` or ``client_id`` must appear in a multi-aud list
    - ``iss`` must be ``accounts.google.com`` or ``https://accounts.google.com``
    """
    if not client_id:
        raise ValueError("GOOGLE_CLIENT_ID is not configured")
    try:
        idinfo = google_id_token.verify_oauth2_token(
            raw_token,
            _google_request(),
            client_id,
        )
    except (ValueError, google_auth_exceptions.GoogleAuthError) as exc:
        raise ValueError(str(exc)) from exc

    claims = dict(idinfo)
    iss = claims.get("iss")
    if iss not in _GOOGLE_ISSUERS:
        raise ValueError("Invalid Google token issuer")

    aud = claims.get("aud")
    if isinstance(aud, list):
        if client_id not in aud:
            raise ValueError("Invalid Google token audience")
    elif aud != client_id:
        raise ValueError("Invalid Google token audience")

    exp = claims.get("exp")
    if exp is None:
        raise ValueError("Invalid Google token: missing exp")
    # Library already enforces expiry; reject only if clearly stale (clock skew / replays).
    if time.time() > float(exp) + 120:
        raise ValueError("Google token expired")

    return claims


def verify_apple_identity_token(
    raw_token: str,
    bundle_id: str,
    *,
    raw_nonce: str | None = None,
) -> dict[str, Any]:
    """
    Validate an Apple ``identity_token`` (JWT) using Apple's JWKS.

    - Signature via Apple keys (JWKS client is process-singleton with cached key set).
    - ``iss`` = ``https://appleid.apple.com``, ``aud`` = bundle / Services ID.
    - ``exp`` validated by PyJWT.

    **Nonce (native / mobile):** When the client sent a nonce in the Apple authorization
    request, pass the same raw string as ``raw_nonce`` so the server checks the token's
    ``nonce`` claim (SHA256, base64url). Web SPA flows typically omit this.
    """
    if not bundle_id:
        raise ValueError("APPLE_BUNDLE_ID is not configured")
    jwks_client = _get_apple_jwks_client()
    signing_key = jwks_client.get_signing_key_from_jwt(raw_token)
    last_err: Exception | None = None
    claims: dict[str, Any] | None = None
    for alg in ("RS256", "ES256"):
        try:
            claims = jwt.decode(
                raw_token,
                signing_key.key,
                algorithms=[alg],
                audience=bundle_id,
                issuer="https://appleid.apple.com",
            )
            break
        except jwt.InvalidTokenError as exc:
            last_err = exc
            continue
    if claims is None:
        err = last_err or RuntimeError("unknown token error")
        raise ValueError(f"Invalid Apple identity token: {err}") from err

    if raw_nonce is not None:
        token_nonce = claims.get("nonce")
        if token_nonce is None:
            raise ValueError("Apple token missing nonce claim (required when nonce is sent)")
        if not apple_nonce_matches_token_claim(raw_nonce, str(token_nonce)):
            raise ValueError("Invalid Apple nonce")

    return claims
