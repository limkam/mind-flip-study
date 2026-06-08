"""Send transactional email via Resend."""

from __future__ import annotations

import logging

from config import settings

log = logging.getLogger(__name__)


def send_email(to: str, subject: str, html: str) -> bool:
    """Send a transactional email. Returns True on success."""
    if not settings.RESEND_API_KEY:
        log.info("Email skipped (RESEND_API_KEY not set): to=%s subject=%s", to, subject)
        return False
    try:
        import resend

        resend.api_key = settings.RESEND_API_KEY
        resend.Emails.send(
            {
                "from": settings.FROM_EMAIL,
                "to": to,
                "subject": subject,
                "html": html,
            },
        )
        return True
    except Exception as exc:
        log.error("Email send failed to %s: %s", to, exc)
        return False
