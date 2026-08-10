from __future__ import annotations

from types import SimpleNamespace

import pytest

from config import settings
from emails.sender import EmailDeliveryError, send_email_or_raise
from emails.templates.sign_in_code import sign_in_code_email


def test_sign_in_template_has_security_and_expiration_copy() -> None:
    html = sign_in_code_email("123456")

    assert "MindFlip" in html
    assert "123456" in html
    assert "10 minutes" in html
    assert "Never share this code" in html


def test_resend_delivery_uses_configured_sender(monkeypatch: pytest.MonkeyPatch) -> None:
    sent: list[dict] = []
    fake_resend = SimpleNamespace(
        api_key=None,
        Emails=SimpleNamespace(send=lambda payload: sent.append(payload) or {"id": "email_123"}),
    )
    monkeypatch.setitem(__import__("sys").modules, "resend", fake_resend)
    monkeypatch.setattr(settings, "RESEND_API_KEY", "test-key")
    monkeypatch.setattr(settings, "FROM_EMAIL", "MindFlip <noreply@i-educate.com>")

    send_email_or_raise("learner@example.com", "Verification", "<p>code</p>")

    assert fake_resend.api_key == "test-key"
    assert sent == [{
        "from": "MindFlip <noreply@i-educate.com>",
        "to": ["learner@example.com"],
        "subject": "Verification",
        "html": "<p>code</p>",
    }]


def test_resend_delivery_rejects_unconfirmed_response(monkeypatch: pytest.MonkeyPatch) -> None:
    fake_resend = SimpleNamespace(
        api_key=None,
        Emails=SimpleNamespace(send=lambda _payload: {}),
    )
    monkeypatch.setitem(__import__("sys").modules, "resend", fake_resend)
    monkeypatch.setattr(settings, "RESEND_API_KEY", "test-key")

    with pytest.raises(EmailDeliveryError):
        send_email_or_raise("learner@example.com", "Verification", "<p>code</p>")
