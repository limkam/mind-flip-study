"""Tests for book cascade deletion helpers."""

from __future__ import annotations

from uuid import uuid4

from services.book_deletion import _flashcard_set_ids_for_book


class _FakeScalars:
    def __init__(self, values):
        self._values = values

    def all(self):
        return self._values


class _FakeSession:
    def __init__(self, responses):
        self._responses = list(responses)

    async def scalars(self, _stmt):
        return _FakeScalars(self._responses.pop(0))


async def test_collects_linked_and_resource_and_orphan_sets():
    book_id = uuid4()
    set_a = uuid4()
    set_b = uuid4()
    set_c = uuid4()
    task_id = "task-abc-123"

    book = type("Book", (), {})()
    book.id = book_id
    book.user_id = uuid4()
    book.title = "Test Book"
    book.extras = {"ai_job": {"task_id": task_id, "resource_id": str(set_b)}}

    db = _FakeSession(
        [
            [set_a],  # linked by book_id
            [set_c],  # orphaned by job marker
            [],  # legacy scan
            [],  # orphaned by matching title
        ],
    )

    ids = await _flashcard_set_ids_for_book(db, book)
    assert set(ids) == {set_a, set_b, set_c}
