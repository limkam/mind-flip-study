"""Celery health helper."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

from celery_health import inspect_celery_workers


def test_inspect_celery_workers_unavailable_when_no_ping() -> None:
    mock_inspector = MagicMock()
    mock_inspector.ping.return_value = None
    with patch("tasks.celery_app.celery") as mock_celery:
        mock_celery.control.inspect.return_value = mock_inspector
        result = inspect_celery_workers()
    assert result["status"] == "unavailable"
    assert result["workers"] == []


def test_inspect_celery_workers_ok_when_ping_returns_workers() -> None:
    mock_inspector = MagicMock()
    mock_inspector.ping.return_value = {"celery@host": {"ok": "pong"}}
    with patch("tasks.celery_app.celery") as mock_celery:
        mock_celery.control.inspect.return_value = mock_inspector
        result = inspect_celery_workers()
    assert result["status"] == "ok"
    assert "celery@host" in result["workers"]
