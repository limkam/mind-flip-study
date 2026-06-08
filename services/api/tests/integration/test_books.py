"""Books + S3 presign flows (S3 mocked)."""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from starlette.testclient import TestClient

from dependencies import enforce_tier_limit, get_current_user, get_db
from main import app
from models.enums import UserRole
from models.user import User


@pytest.fixture
def client() -> TestClient:
    with TestClient(app) as c:
        yield c


@pytest.fixture
def student_user() -> User:
    now = datetime.now(UTC)
    return User(
        id=uuid4(),
        email="books-tester@example.com",
        hashed_password="x",
        role=UserRole.student,
        full_name="Books Tester",
        preferences={},
        is_banned=False,
        subscription_tier="free",
        created_at=now,
        updated_at=now,
    )


@pytest.fixture
def authed_client(client: TestClient, student_user: User) -> TestClient:
    mock_db = AsyncMock()
    mock_db.scalar = AsyncMock(return_value=0)

    async def _execute(_stmt):
        result = MagicMock()
        result.scalars.return_value.all.return_value = []
        result.scalar_one_or_none.return_value = None
        return result

    mock_db.execute = AsyncMock(side_effect=_execute)

    async def _override() -> User:
        return student_user

    async def _get_db():
        yield mock_db

    async def _noop_tier() -> None:
        return None

    app.dependency_overrides[get_current_user] = _override
    app.dependency_overrides[get_db] = _get_db
    app.dependency_overrides[enforce_tier_limit("books")] = _noop_tier
    try:
        yield client
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(enforce_tier_limit("books"), None)


def test_upload_url_returns_key_under_user_prefix(authed_client: TestClient, student_user: User) -> None:
    with patch("routers.books.generate_presigned_put_url", return_value="https://s3.example/presigned"):
        r = authed_client.post(
            "/books/upload-url",
            json={
                "filename": "mybook.pdf",
                "content_type": "application/pdf",
                "file_size_bytes": 1024,
            },
        )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["upload_url"] == "https://s3.example/presigned"
    assert data["expires_in"] == 3600
    assert data["s3_key"].startswith(f"books/{student_user.id}/")
    assert data["s3_key"].endswith("/mybook.pdf")


def test_create_book_rejects_foreign_s3_key(authed_client: TestClient, student_user: User) -> None:
    other = uuid4()
    bad_key = f"books/{other}/{uuid4()}/x.pdf"
    r = authed_client.post(
        "/books/",
        json={
            "title": "T",
            "author": "A",
            "s3_key": bad_key,
            "file_size_bytes": 10,
        },
    )
    assert r.status_code == 400


def test_list_books_paginated_empty(authed_client: TestClient) -> None:
    r = authed_client.get("/books/")
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["items"] == []
    assert data["page"] == 1
    assert data["size"] == 50
    assert data["total"] == 0
    assert data["has_more"] is False
    assert data["total_pages"] == 0


def test_create_book_404_when_object_missing(authed_client: TestClient, student_user: User) -> None:
    key = f"books/{student_user.id}/{uuid4()}/x.pdf"
    with patch("routers.books.head_object_content_length", return_value=None):
        r = authed_client.post(
            "/books/",
            json={
                "title": "T",
                "author": "A",
                "s3_key": key,
                "file_size_bytes": 10,
            },
        )
    assert r.status_code == 404
