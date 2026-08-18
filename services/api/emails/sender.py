"""Send transactional email via Resend."""

from __future__ import annotations

import hashlib
import logging

from config import settings
from emails.provider import LogOnlyEmailProvider, provider_for

log = logging.getLogger(__name__)


class EmailDeliveryError(RuntimeError):
    """Raised when the provider does not confirm transactional email delivery."""


def _recipient_fingerprint(email: str) -> str:
    return hashlib.sha256(email.strip().lower().encode("utf-8")).hexdigest()[:12]


def send_email_or_raise(
    to: str,
    subject: str,
    html: str,
    attachments: list[dict] | None = None,
) -> None:
    """Send through Resend and require a provider message id."""
    provider = provider_for(to)
    if provider is None:
        log.info(
            "Email suppressed by delivery gate recipient=%s mode=%s",
            _recipient_fingerprint(to),
            settings.EMAIL_DELIVERY_MODE,
        )
        raise EmailDeliveryError("Email delivery gate suppressed this send")
    if isinstance(provider, LogOnlyEmailProvider):
        log.info(
            "Email log-only (delivery gate) recipient=%s subject=%s",
            _recipient_fingerprint(to),
            subject,
        )
        return
    if not settings.RESEND_API_KEY:
        log.error("Email delivery is not configured")
        raise EmailDeliveryError("Email delivery is not configured")
    try:
        import resend

        resend.api_key = settings.RESEND_API_KEY
        payload = {
            "from": settings.FROM_EMAIL,
            "to": [to],
            "subject": subject,
            "html": html,
        }
        if attachments:
            payload["attachments"] = attachments
        result = resend.Emails.send(payload)
        message_id = result.get("id") if isinstance(result, dict) else getattr(result, "id", None)
        if not message_id:
            raise EmailDeliveryError("Provider did not return a message id")
    except EmailDeliveryError:
        raise
    except Exception as exc:
        log.exception(
            "Email provider request failed recipient=%s error_type=%s",
            _recipient_fingerprint(to),
            type(exc).__name__,
        )
        raise EmailDeliveryError("Email provider request failed") from exc


def send_email(
    to: str,
    subject: str,
    html: str,
    attachments: list[dict] | None = None,
) -> bool:
    """Send a transactional email. Returns True on success."""
    try:
        send_email_or_raise(to, subject, html, attachments=attachments)
        return True
    except EmailDeliveryError:
        return False
