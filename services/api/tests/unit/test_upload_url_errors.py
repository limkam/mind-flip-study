"""Structured errors for /books/upload-url."""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import patch
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from dependencies import get_current_user
from main import app
from models.enums import UserRole
from models.user import User
from s3_service import S3ConfigurationError


def _user() -> User:
    now = datetime.now(UTC)
    return User(
        id=uuid4(),
        email="upload@example.com",
        hashed_password="x",
        role=UserRole.student,
        full_name="Upload Test",
        preferences={},
        is_banned=False,
        subscription_tier="free",
        onboarding_completed=True,
        ip_history=[],
        created_at=now,
        updated_at=now,
    )


@pytest.mark.asyncio
async def test_upload_url_returns_structured_s3_error() -> None:
    student = _user()

    async def _override() -> User:
        return student

    app.dependency_overrides[get_current_user] = _override
    try:
        with patch(
            "routers.books.generate_presigned_put_url",
            side_effect=S3ConfigurationError("AWS credentials are missing"),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                r = await client.post(
                    "/books/upload-url",
                    json={
                        "filename": "book.pdf",
                        "content_type": "application/pdf",
                        "file_size_bytes": 100,
                    },
                )
        assert r.status_code == 503
        body = r.json()
        assert body["detail"]["error"] == "Failed to generate upload URL"
        assert "AWS" in body["detail"]["detail"]
    finally:
        app.dependency_overrides.pop(get_current_user, None)
