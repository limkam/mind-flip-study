"""Tests for PDF text extraction helpers."""

from __future__ import annotations

from io import BytesIO

from pypdf import PdfWriter

from pdf_text import pdf_is_likely_image_only


def test_pdf_is_likely_image_only_rejects_blank_pdf():
    writer = PdfWriter()
    writer.add_blank_page(width=200, height=200)
    buf = BytesIO()
    writer.write(buf)
    assert pdf_is_likely_image_only(buf.getvalue()) is True


def test_pdf_is_likely_image_only_accepts_text_pdf(monkeypatch):
    long_text = "MindFlip extractable chapter text. " * 30

    class FakePage:
        def extract_text(self):
            return long_text

    class FakeReader:
        pages = [FakePage()]

    monkeypatch.setattr("pdf_text.PdfReader", lambda _: FakeReader())
    assert pdf_is_likely_image_only(b"fake-pdf") is False


def test_study_content_system_differs_by_level():
    from generation_prompts import study_content_system

    brief = study_content_system("brief")
    depth = study_content_system("in_depth")
    assert "exactly 4" in brief
    assert "exactly 8" in depth
    assert "examples" in depth.lower()
