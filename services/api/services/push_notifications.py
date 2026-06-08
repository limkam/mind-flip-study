"""Send push notifications via the Expo Push API."""

from __future__ import annotations

import logging
from typing import Any

import httpx

log = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


def send_expo_push(
    *,
    token: str,
    title: str,
    body: str,
    data: dict[str, Any] | None = None,
) -> bool:
    """Return True if Expo accepted the message."""
    payload = {
        "to": token,
        "title": title,
        "body": body,
        "sound": "default",
        "data": data or {},
    }
    try:
        with httpx.Client(timeout=15.0) as client:
            resp = client.post(EXPO_PUSH_URL, json=payload)
            resp.raise_for_status()
            body_json = resp.json()
        tickets = body_json.get("data") if isinstance(body_json, dict) else None
        if isinstance(tickets, list) and tickets:
            status = tickets[0].get("status")
            if status == "error":
                log.warning("expo push error: %s", tickets[0])
                return False
        return True
    except Exception:
        log.exception("expo push send failed")
        return False
