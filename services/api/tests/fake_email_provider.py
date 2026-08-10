"""Deterministic recording provider used only by tests."""
from dataclasses import dataclass
from datetime import UTC, datetime

from emails.provider import EmailSendResult


@dataclass(frozen=True)
class SendAttempt:
    job_id: str
    idempotency_key: str
    recipient: str
    template_key: str
    attempt_number: int
    timestamp: datetime


class RecordingEmailProvider:
    def __init__(self, results: list[EmailSendResult] | None = None):
        self.results = list(results or [EmailSendResult("recording", "msg-1", True)])
        self.attempts: list[SendAttempt] = []

    def send(self, *, to, subject, html, text, idempotency_key, tags, reply_to=None):
        self.attempts.append(SendAttempt(tags["job_id"], idempotency_key, to, tags["journey"],
                                         int(tags["attempt"]), datetime.now(UTC)))
        return self.results.pop(0) if self.results else EmailSendResult("recording", "msg-repeat", True)
