"""Unit tests for book duplicate detection."""

from services.book_duplicate import normalize_book_title


def test_normalize_book_title_strips_punctuation():
    assert normalize_book_title("  Biology: An Introduction!  ") == "biology an introduction"


def test_normalize_book_title_case_insensitive():
    assert normalize_book_title("BIOLOGY") == normalize_book_title("biology")
