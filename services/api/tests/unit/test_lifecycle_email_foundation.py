from __future__ import annotations

import base64
import hashlib
import hmac
from datetime import UTC, datetime

import pytest

from config import settings
from emails.provider import LogOnlyEmailProvider, provider_for
from emails.templates.lifecycle import render_lifecycle
from emails.unsubscribe import make_token, read_token
from routers.email_webhooks import verify_webhook
from services.lifecycle_email import retry_at
from tasks.email_tasks import local_week_key
from types import SimpleNamespace


@pytest.mark.parametrize(
    "key,payload",
    [
        ("welcome", {}),
        ("continue_learning", {"entity_name": "Biology <script>"}),
        ("achievement_unlocked", {"achievement_name": "Reader <script>"}),
        ("weekly_progress_summary", {"metrics": {"units_completed": 2}}),
    ],
)
def test_lifecycle_templates_have_html_text_and_safe_links(key, payload):
    values = {
        "first_name": "Ada <script>",
        "cta_url": "https://bilkeys.example/app",
        "preferences_url": "https://bilkeys.example/settings",
        "unsubscribe_url": "https://bilkeys.example/unsubscribe",
        **payload,
    }
    subject, html, text = render_lifecycle(key, values)
    assert subject and "<main>" in html and "Continue in Bilkeys" in text
    assert "<script>" not in html
    assert "Manage preferences" in text and "Unsubscribe" in text


def test_empty_weekly_summary_is_rejected():
    with pytest.raises(ValueError, match="empty_weekly_summary"):
        render_lifecycle(
            "weekly_progress_summary",
            {
                "cta_url": "https://example.com/a",
                "preferences_url": "https://example.com/p",
                "metrics": {},
            },
        )


def test_log_only_provider_never_contacts_resend(monkeypatch):
    monkeypatch.setattr(settings, "EMAIL_DELIVERY_MODE", "log_only")
    provider = provider_for("person@example.com")
    assert isinstance(provider, LogOnlyEmailProvider)
    assert provider.send().metadata == {"delivery": "not_contacted"}


def test_test_mode_enforces_recipient_allowlist(monkeypatch):
    monkeypatch.setattr(settings, "EMAIL_DELIVERY_MODE", "test")
    monkeypatch.setattr(settings, "EMAIL_TEST_RECIPIENTS", "allowed@example.com")
    assert provider_for("blocked@example.com") is None
    assert provider_for("allowed@example.com") is not None


def test_signed_webhook_fixture_and_tamper_rejection(monkeypatch):
    secret = b"fixture-secret"
    monkeypatch.setattr(
        settings, "EMAIL_WEBHOOK_SECRET", "whsec_" + base64.b64encode(secret).decode()
    )
    body, event_id, timestamp = (
        b'{"type":"email.delivered"}',
        "evt_fixture",
        str(int(datetime.now(UTC).timestamp())),
    )
    signed = event_id.encode() + b"." + timestamp.encode() + b"." + body
    signature = (
        "v1,"
        + base64.b64encode(hmac.new(secret, signed, hashlib.sha256).digest()).decode()
    )
    assert verify_webhook(body, event_id, timestamp, signature)
    assert not verify_webhook(body + b" ", event_id, timestamp, signature)
    assert verify_webhook(body, event_id, timestamp, "v1,bad " + signature)
    assert not verify_webhook(body, event_id, str(int(timestamp) - 1), signature)
    assert not verify_webhook(body, "", timestamp, signature)


def test_webhook_expired_timestamp_and_malformed_secret_fail_safely(monkeypatch):
    body, event_id = b"{}", "evt-old"
    old = str(int(datetime.now(UTC).timestamp()) - 301)
    monkeypatch.setattr(settings, "EMAIL_WEBHOOK_SECRET", "whsec_!!!")
    assert not verify_webhook(body, event_id, old, "v1,anything")


def test_retry_is_bounded_and_first_retry_uses_base(monkeypatch):
    monkeypatch.setattr(settings, "EMAIL_RETRY_BASE_SECONDS", 30)
    monkeypatch.setattr(settings, "EMAIL_RETRY_MAX_SECONDS", 100)
    monkeypatch.setattr(settings, "EMAIL_RETRY_JITTER_RATIO", 0.5)
    now = datetime.now(UTC)
    no_jitter = SimpleNamespace(uniform=lambda _a, _b: 0)
    max_jitter = SimpleNamespace(uniform=lambda _a, b: b)
    assert (
        retry_at(SimpleNamespace(retry_count=1), now, random_source=no_jitter) - now
    ).total_seconds() == 30
    assert (
        retry_at(SimpleNamespace(retry_count=99), now, random_source=max_jitter) - now
    ).total_seconds() == 100
    assert (
        retry_at(
            SimpleNamespace(retry_count=1),
            now,
            random_source=no_jitter,
            retry_after_seconds=80,
        )
        - now
    ).total_seconds() == 80


def test_local_week_uses_user_timezone_and_invalid_falls_back_to_utc():
    sunday_utc = datetime(2026, 8, 2, 23, 30, tzinfo=UTC)
    assert local_week_key(sunday_utc, "Pacific/Kiritimati") == "2026-08-03"
    assert local_week_key(sunday_utc, "UTC") == "2026-07-27"
    assert local_week_key(sunday_utc, "invalid/timezone") == "2026-07-27"
    before_dst = datetime(2026, 3, 8, 6, 30, tzinfo=UTC)
    after_dst = datetime(2026, 3, 8, 8, 30, tzinfo=UTC)
    assert local_week_key(before_dst, "America/New_York") == "2026-03-02"
    assert local_week_key(after_dst, "America/New_York") == "2026-03-02"


def test_email_numeric_configuration_validation(monkeypatch):
    monkeypatch.setattr(settings, "EMAIL_RETRY_JITTER_RATIO", 1.1)
    with pytest.raises(ValueError, match="JITTER"):
        settings.validate_email_policy()


def test_unsubscribe_token_is_scoped_expires_and_rejects_tampering(monkeypatch):
    import uuid

    monkeypatch.setattr(settings, "EMAIL_UNSUBSCRIBE_SECRET", "unit-test-secret")
    public_id = uuid.uuid4()
    token = make_token(public_id, "learning", expires_in=60)
    decoded = read_token(token)
    assert decoded[0] == public_id and decoded[1] == "learning"
    with pytest.raises(ValueError):
        read_token(token[:-1] + ("A" if token[-1] != "A" else "B"))
    expired = make_token(public_id, "global", expires_in=-1)
    with pytest.raises(ValueError):
        read_token(expired)
