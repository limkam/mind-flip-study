"""Smoke tests that do not require a real database or Redis."""

from starlette.testclient import TestClient


def test_health_returns_ok():
    from main import app

    with TestClient(app) as client:
        response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
