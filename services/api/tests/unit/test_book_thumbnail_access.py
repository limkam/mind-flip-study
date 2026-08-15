from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from models.book import Book
from models.enums import BookStatus
from routers import books


def _book(owner_id):
    return Book(
        id=uuid4(),
        user_id=owner_id,
        title="Private notes",
        author="Owner",
        s3_key=f"books/{owner_id}/source.pdf",
        s3_url="https://private.example/source.pdf",
        file_size_bytes=10,
        book_code="MF-ABCDEFGH",
        status=BookStatus.ready,
        extras={
            "thumbnail": {
                "status": "ready",
                "s3_key": f"books/{owner_id}/thumbnail-first-page.png",
                "content_type": "image/png",
            },
        },
        created_at=datetime.now(UTC),
    )


@pytest.mark.asyncio
async def test_owner_can_fetch_private_thumbnail(monkeypatch):
    owner_id = uuid4()
    book = _book(owner_id)
    db = AsyncMock()
    db.scalar.return_value = book
    monkeypatch.setattr(books, "get_object_bytes", lambda _key: b"private-preview")

    response = await books.get_book_thumbnail(
        book.id, SimpleNamespace(id=owner_id), db
    )

    assert response.body == b"private-preview"
    assert response.media_type == "image/png"
    assert response.headers["cache-control"] == "private, max-age=86400"


@pytest.mark.asyncio
async def test_non_owner_receives_not_found(monkeypatch):
    db = AsyncMock()
    db.scalar.return_value = None
    fetched = False

    def fetch(_key):
        nonlocal fetched
        fetched = True

    monkeypatch.setattr(books, "get_object_bytes", fetch)

    with pytest.raises(books.HTTPException) as exc:
        await books.get_book_thumbnail(uuid4(), SimpleNamespace(id=uuid4()), db)

    assert exc.value.status_code == 404
    assert fetched is False
