"""TOC auto-enqueue helpers on book create."""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException

from models.book import Book
from models.enums import BookStatus
from routers.books import _enqueue_toc_extraction_for_book


def _book(*, extras: dict | None = None) -> Book:
    now = datetime.now(UTC)
    book = Book(
        id=uuid4(),
        user_id=uuid4(),
        title="Test Book",
        author="Author",
        s3_key=f"books/{uuid4()}/file.pdf",
        s3_url="https://example.com/file.pdf",
        file_size_bytes=100,
        status=BookStatus.ready,
        extras=extras or {"table_of_contents": []},
        created_at=now,
    )
    return book


@patch("routers.books.extract_book_toc_task")
def test_enqueue_toc_starts_celery_task(mock_task: MagicMock) -> None:
    mock_task.delay.return_value = MagicMock(id="job-abc")
    book = _book()

    job_id = _enqueue_toc_extraction_for_book(book)

    assert job_id == "job-abc"
    mock_task.delay.assert_called_once_with(str(book.id))
    assert book.extras["processing"]["phase"] == "extracting_contents"
    assert book.extras["processing"]["job_id"] == "job-abc"


@patch("routers.books.extract_book_toc_task")
def test_enqueue_toc_is_idempotent_while_in_progress(mock_task: MagicMock) -> None:
    book = _book(
        extras={
            "table_of_contents": [],
            "processing": {
                "phase": "analyzing_structure",
                "kind": "toc_extraction",
                "job_id": "existing-job",
            },
        },
    )

    job_id = _enqueue_toc_extraction_for_book(book)

    assert job_id == "existing-job"
    mock_task.delay.assert_not_called()


@patch("routers.books.extract_book_toc_task")
def test_enqueue_toc_blocks_when_already_complete(mock_task: MagicMock) -> None:
    book = _book(
        extras={
            "table_of_contents": [{"title": "Chapter 1"}],
            "processing": {"phase": "complete", "kind": "toc_extraction", "job_id": "old"},
        },
    )

    with pytest.raises(HTTPException) as exc:
        _enqueue_toc_extraction_for_book(book)

    assert exc.value.status_code == 409
    mock_task.delay.assert_not_called()


@patch("routers.books.extract_book_toc_task")
def test_enqueue_toc_allows_retry_when_requested(mock_task: MagicMock) -> None:
    mock_task.delay.return_value = MagicMock(id="retry-job")
    book = _book(
        extras={
            "table_of_contents": [{"title": "Chapter 1"}],
            "processing": {"phase": "complete", "kind": "toc_extraction", "job_id": "old"},
        },
    )

    job_id = _enqueue_toc_extraction_for_book(book, allow_retry=True)

    assert job_id == "retry-job"
    mock_task.delay.assert_called_once()
