"""Send Owner Console alert notifications to Slack via incoming webhook.

Delivery is gated by SLACK_ALERT_DELIVERY_MODE, mirroring the EMAIL_DELIVERY_MODE gate in
emails/provider.py: "disabled" sends nothing, "log_only" logs the message instead of
posting, "production" posts to SLACK_WEBHOOK_URL.
"""

from __future__ import annotations

import logging

import httpx

from config import settings

log = logging.getLogger(__name__)

_SEVERITY_EMOJI = {"warning": ":warning:", "critical": ":rotating_light:"}


def send_slack_alert(text: str, *, severity: str = "warning") -> bool:
    """Return True if the alert was delivered (or accepted as log-only)."""
    mode = settings.SLACK_ALERT_DELIVERY_MODE.strip().lower()
    if mode == "disabled":
        return False
    prefixed = f"{_SEVERITY_EMOJI.get(severity, ':warning:')} {text}"
    if mode == "log_only":
        log.info("Slack alert (log-only): %s", prefixed)
        return True
    if mode != "production" or not settings.SLACK_WEBHOOK_URL:
        return False
    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.post(settings.SLACK_WEBHOOK_URL, json={"text": prefixed})
            resp.raise_for_status()
        return True
    except Exception:
        log.exception("slack alert send failed")
        return False
