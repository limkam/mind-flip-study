from types import SimpleNamespace
import sys

import pytest

import document_thumbnail


class _FakePdf:
    page_count = 1

    def load_page(self, _index):
        pixmap = SimpleNamespace(tobytes=lambda _format: b"png-preview")
        return SimpleNamespace(
            rect=SimpleNamespace(width=360),
            get_pixmap=lambda **_kwargs: pixmap,
        )

    def close(self):
        return None


def _fake_pymupdf():
    return SimpleNamespace(
        open=lambda **_kwargs: _FakePdf(),
        Matrix=lambda x, y: (x, y),
    )


def test_pdf_thumbnail_renders_only_first_page(monkeypatch):
    monkeypatch.setitem(sys.modules, "pymupdf", _fake_pymupdf())

    result = document_thumbnail.generate_first_page_thumbnail(b"%PDF", filename="book.pdf")

    assert result == b"png-preview"


@pytest.mark.parametrize("extension", [".docx", ".pptx"])
def test_office_thumbnail_converts_before_rendering(monkeypatch, extension):
    monkeypatch.setattr(document_thumbnail, "_office_to_pdf", lambda data, ext: b"converted-pdf")
    monkeypatch.setitem(sys.modules, "pymupdf", _fake_pymupdf())

    result = document_thumbnail.generate_first_page_thumbnail(b"office", filename=f"book{extension}")

    assert result == b"png-preview"


def test_unsupported_thumbnail_type_fails_cleanly():
    with pytest.raises(document_thumbnail.ThumbnailGenerationError):
        document_thumbnail.generate_first_page_thumbnail(b"text", filename="notes.txt")
