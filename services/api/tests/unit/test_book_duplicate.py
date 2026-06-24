"""Unit tests for book duplicate detection."""

from uuid import uuid4

from services.book_duplicate import (
    PDF_SHA256_EXTRAS_KEY,
    find_duplicate_books,
    normalize_book_title,
    pdf_sha256,
)


def test_normalize_book_title_strips_punctuation():
    assert normalize_book_title("  Biology: An Introduction!  ") == "biology an introduction"


def test_normalize_book_title_case_insensitive():
    assert normalize_book_title("BIOLOGY") == normalize_book_title("biology")


def test_pdf_sha256_stable():
    data = b"%PDF-1.4 sample"
    assert pdf_sha256(data) == pdf_sha256(data)
    assert len(pdf_sha256(data)) == 64


class _FakeBook:
    def __init__(self, *, title: str, file_size_bytes: int, extras: dict | None = None):
        self.id = uuid4()
        self.title = title
        self.author = "Author"
        self.s3_key = "books/test/file.pdf"
        self.file_size_bytes = file_size_bytes
        self.extras = extras or {}


class _FakeResult:
    def __init__(self, books):
        self._books = books

    def scalars(self):
        return self

    def all(self):
        return self._books


class _FakeDb:
    def __init__(self, books):
        self._books = books

    async def execute(self, _query):
        return _FakeResult(self._books)


async def test_find_duplicate_by_stored_pdf_hash():
    pdf_bytes = b"%PDF-1.4 duplicate test"
    digest = pdf_sha256(pdf_bytes)
    books = [
        _FakeBook(
            title="Math Textbook",
            file_size_bytes=len(pdf_bytes),
            extras={PDF_SHA256_EXTRAS_KEY: digest},
        ),
    ]
    db = _FakeDb(books)
    matches = await find_duplicate_books(
        db,
        user_id=uuid4(),
        title="Different Title",
        file_sha256=digest,
        file_size_bytes=len(pdf_bytes),
    )
    assert len(matches) == 1


async def test_find_duplicate_lazy_hash_same_size():
    pdf_bytes = b"%PDF-1.4 duplicate test"
    digest = pdf_sha256(pdf_bytes)
    books = [
        _FakeBook(title="Math Textbook", file_size_bytes=len(pdf_bytes), extras={}),
    ]
    db = _FakeDb(books)

    def fetch_pdf(_key: str, _size: int) -> bytes:
        return pdf_bytes

    matches = await find_duplicate_books(
        db,
        user_id=uuid4(),
        title="Renamed Copy",
        file_sha256=digest,
        file_size_bytes=len(pdf_bytes),
        fetch_pdf=fetch_pdf,
    )
    assert len(matches) == 1


async def test_find_duplicate_by_title_when_hash_differs():
    books = [_FakeBook(title="Introduction to Logic", file_size_bytes=1000, extras={})]
    db = _FakeDb(books)
    matches = await find_duplicate_books(
        db,
        user_id=uuid4(),
        title="Introduction to Logic",
        file_sha256=pdf_sha256(b"other"),
        file_size_bytes=2000,
    )
    assert len(matches) == 1
