"""Signed scoped unsubscribe tokens using a public random contact identifier."""

import base64
import hashlib
import hmac
import secrets
import time
import uuid

from config import settings


def make_token(
    public_id: uuid.UUID, scope: str, *, expires_in: int = 60 * 60 * 24 * 90
) -> str:
    if not settings.EMAIL_UNSUBSCRIBE_SECRET:
        raise ValueError("unsubscribe signing is not configured")
    if scope not in {"global", "learning", "achievements", "weekly_summary"}:
        raise ValueError("invalid unsubscribe scope")
    issued = int(time.time())
    payload = f"{public_id.hex}.{scope}.{issued}.{issued + expires_in}.{secrets.token_urlsafe(12)}"
    signature = hmac.new(
        settings.EMAIL_UNSUBSCRIBE_SECRET.encode(), payload.encode(), hashlib.sha256
    ).digest()
    encoded_payload = base64.urlsafe_b64encode(payload.encode()).decode().rstrip("=")
    encoded_signature = base64.urlsafe_b64encode(signature).decode().rstrip("=")
    return f"{encoded_payload}.{encoded_signature}"


def read_token(token: str) -> tuple[uuid.UUID, str, int, int]:
    try:
        encoded_payload, encoded_signature = token.split(".", 1)
        payload = base64.urlsafe_b64decode(
            encoded_payload + "=" * (-len(encoded_payload) % 4)
        )
        signature = base64.urlsafe_b64decode(
            encoded_signature + "=" * (-len(encoded_signature) % 4)
        )
        if base64.urlsafe_b64encode(signature).decode().rstrip("=") != encoded_signature:
            raise ValueError
        expected = hmac.new(
            settings.EMAIL_UNSUBSCRIBE_SECRET.encode(), payload, hashlib.sha256
        ).digest()
        if not settings.EMAIL_UNSUBSCRIBE_SECRET or not hmac.compare_digest(
            signature, expected
        ):
            raise ValueError
        public_id, scope, issued, expires, _nonce = payload.decode().split(".", 4)
        if scope not in {"global", "learning", "achievements", "weekly_summary"} or int(
            expires
        ) < int(time.time()):
            raise ValueError
        return uuid.UUID(hex=public_id), scope, int(issued), int(expires)
    except (ValueError, TypeError, UnicodeDecodeError) as exc:
        raise ValueError("invalid unsubscribe token") from exc
