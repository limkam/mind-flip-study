"""Provider boundary and explicit delivery safety gate."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol

from config import settings


class ProviderFailure(Exception):
    category = "temporary_provider_failure"
    retryable = True

    def __init__(self, message: str = "", *, retry_after_seconds: int | None = None):
        super().__init__(message)
        self.retry_after_seconds = retry_after_seconds


class NetworkProviderError(ProviderFailure):
    category = "network_error"


class ProviderTimeoutError(ProviderFailure):
    category = "provider_timeout"


class RateLimitedError(ProviderFailure):
    category = "rate_limited"


class TemporaryProviderError(ProviderFailure):
    category = "temporary_provider_failure"


class InvalidRecipientError(ProviderFailure):
    category, retryable = "invalid_recipient", False


class AuthenticationProviderError(ProviderFailure):
    category, retryable = "authentication_error", False


class ConfigurationProviderError(ProviderFailure):
    category, retryable = "configuration_error", False


class PermanentProviderRejection(ProviderFailure):
    category, retryable = "permanent_provider_rejection", False


@dataclass(frozen=True)
class EmailSendResult:
    provider: str
    provider_message_id: str | None
    accepted: bool
    failure_category: str | None = None
    failure_message: str | None = None
    retryable: bool = False
    metadata: dict = field(default_factory=dict)
    retry_after_seconds: int | None = None


class EmailProvider(Protocol):
    def send(
        self,
        *,
        to: str,
        subject: str,
        html: str,
        text: str,
        idempotency_key: str,
        tags: dict[str, str],
        reply_to: str | None = None,
    ) -> EmailSendResult: ...


class ResendEmailProvider:
    name = "resend"

    def send(
        self,
        *,
        to: str,
        subject: str,
        html: str,
        text: str,
        idempotency_key: str,
        tags: dict[str, str],
        reply_to: str | None = None,
    ) -> EmailSendResult:
        try:
            import resend

            resend.api_key = settings.RESEND_API_KEY
            payload = {
                "from": settings.FROM_EMAIL,
                "to": [to],
                "subject": subject,
                "html": html,
                "text": text,
                "headers": {"Idempotency-Key": idempotency_key},
                "tags": [{"name": k, "value": v} for k, v in tags.items()],
            }
            if reply_to:
                payload["reply_to"] = reply_to
            result = resend.Emails.send(payload)
            message_id = (
                result.get("id")
                if isinstance(result, dict)
                else getattr(result, "id", None)
            )
            if not message_id:
                return EmailSendResult(
                    self.name,
                    None,
                    False,
                    "permanent_provider_rejection",
                    "Provider returned no message id",
                )
            return EmailSendResult(
                self.name, str(message_id), True, metadata={"accepted": True}
            )
        except ProviderFailure as exc:
            return EmailSendResult(
                self.name,
                None,
                False,
                exc.category,
                str(exc)[:500],
                exc.retryable,
                retry_after_seconds=exc.retry_after_seconds,
            )
        except TimeoutError:
            return EmailSendResult(
                self.name,
                None,
                False,
                "provider_timeout",
                "provider timeout",
                retryable=True,
            )
        except (ConnectionError, OSError):
            return EmailSendResult(
                self.name,
                None,
                False,
                "network_error",
                "provider network error",
                retryable=True,
            )
        except Exception as exc:
            status_code = getattr(exc, "status_code", None)
            if status_code == 429:
                retry_after = getattr(exc, "retry_after", None)
                return EmailSendResult(
                    self.name,
                    None,
                    False,
                    "rate_limited",
                    "provider rate limit",
                    retryable=True,
                    retry_after_seconds=retry_after
                    if isinstance(retry_after, int)
                    else None,
                )
            if status_code in {400, 404, 422}:
                return EmailSendResult(
                    self.name,
                    None,
                    False,
                    "invalid_recipient",
                    "provider rejected recipient",
                )
            if status_code == 401:
                return EmailSendResult(
                    self.name,
                    None,
                    False,
                    "authentication_error",
                    "provider authentication failed",
                )
            if status_code == 403:
                return EmailSendResult(
                    self.name,
                    None,
                    False,
                    "configuration_error",
                    "provider configuration rejected",
                )
            if isinstance(status_code, int) and status_code >= 500:
                return EmailSendResult(
                    self.name,
                    None,
                    False,
                    "temporary_provider_failure",
                    "provider unavailable",
                    retryable=True,
                )
            return EmailSendResult(
                self.name,
                None,
                False,
                "temporary_provider_failure",
                type(exc).__name__,
                retryable=True,
            )


class LogOnlyEmailProvider:
    name = "log_only"

    def send(self, **_: object) -> EmailSendResult:
        return EmailSendResult(
            self.name, None, True, metadata={"delivery": "not_contacted"}
        )


def provider_for(recipient: str) -> EmailProvider | None:
    mode = settings.EMAIL_DELIVERY_MODE.strip().lower()
    if mode == "disabled":
        return None
    if mode == "log_only":
        return LogOnlyEmailProvider()
    if mode == "test":
        return (
            ResendEmailProvider()
            if recipient.strip().lower() in settings.email_test_recipients
            else None
        )
    if mode == "production":
        if not (
            settings.EMAIL_PRODUCTION_ENABLED
            and settings.EMAIL_SENDING_DOMAIN_VERIFIED
            and settings.RESEND_API_KEY
        ):
            return None
        return ResendEmailProvider()
    return None
