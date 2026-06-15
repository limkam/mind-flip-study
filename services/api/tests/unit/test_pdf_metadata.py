"""PDF metadata sanitization — reject file paths and OS usernames."""

from pdf_metadata import (
    _author_looks_unreliable,
    _looks_like_file_path,
    _sanitize_embedded_metadata,
    title_from_upload_filename,
)


def test_looks_like_file_path_windows():
    assert _looks_like_file_path(r"C:\Users\HP\Documents\Economics.pdf")
    assert _looks_like_file_path(r"C:\Users\HP\Downloads\chapter1.pdf")


def test_looks_like_file_path_mac():
    assert _looks_like_file_path("/Users/jane/Documents/My Book.pdf")


def test_looks_like_file_path_rejects_real_titles():
    assert not _looks_like_file_path("Introduction to Economics")
    assert not _looks_like_file_path("Deep Learning")


def test_author_looks_unreliable_hp_username():
    title = r"C:\Users\HP\Documents\Economics.pdf"
    assert _author_looks_unreliable("HP", title=title)
    assert _author_looks_unreliable("hp", title=title)


def test_author_looks_unreliable_keeps_real_names():
    assert not _author_looks_unreliable("Jane Smith")
    assert not _author_looks_unreliable("Stephen King")


def test_sanitize_embedded_metadata_strips_path_and_username():
    title, author = _sanitize_embedded_metadata(
        r"C:\Users\HP\Documents\Economics Textbook.pdf",
        "HP",
    )
    assert title == ""
    assert author == ""


def test_sanitize_embedded_metadata_keeps_good_values():
    title, author = _sanitize_embedded_metadata(
        "Introduction to Economics",
        "N. Gregory Mankiw",
    )
    assert title == "Introduction to Economics"
    assert author == "N. Gregory Mankiw"


def test_title_from_upload_filename():
    assert title_from_upload_filename("Introduction_to_Economics.pdf") == "Introduction to Economics"
    assert title_from_upload_filename("document.pdf") == "document"
    assert title_from_upload_filename("upload.pdf") == "upload"
