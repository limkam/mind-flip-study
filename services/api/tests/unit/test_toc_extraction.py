"""TOC extraction heuristics."""

from unittest.mock import patch

from toc_extraction import (
    _align_chapter_titles,
    extract_toc_from_bookmarks,
    extract_toc_from_text,
    extract_toc_from_numbered_list,
    extract_toc_from_pdf_bytes,
)
from pypdf import PdfWriter
from io import BytesIO

CAFIA_TOC = [
    {"chapter_number": 1, "title": "Executive Summary", "subtopics": []},
    {"chapter_number": 2, "title": "About CAFIA and Policy Implications", "subtopics": []},
    {"chapter_number": 3, "title": "Survey Objectives and Approach", "subtopics": []},
    {"chapter_number": 14, "title": "References", "subtopics": []},
    {"chapter_number": 15, "title": "Appendix A: Full Statistical Tables", "subtopics": []},
]


def test_extract_toc_from_text_finds_all_chapters():
    text = """
    Table of Contents
    Chapter 1  Introduction to Biology .............. 1
    Chapter 2  The Chemistry of Life ................. 15
    Chapter 3  Cell Structure ........................ 42
    Chapter 4  Energy and Metabolism ................. 78
    Chapter 5  Genetics .............................. 110
    """
    chapters = extract_toc_from_text(text)
    assert len(chapters) == 5
    assert chapters[0]["title"] == "Introduction to Biology"
    assert chapters[4]["title"] == "Genetics"


def test_align_keeps_all_chapters_even_if_unverified():
    chapters = [
        {"chapter_number": 1, "title": "Real Chapter", "subtopics": []},
        {"chapter_number": 2, "title": "Missing From Body", "subtopics": []},
    ]
    full_text = "Real Chapter\nSome body content here."
    aligned = _align_chapter_titles(chapters, full_text)
    assert len(aligned) == 2


def test_bookmarks_prefers_chapters_over_parts():
    writer = PdfWriter()
    writer.add_blank_page(200, 200)
    writer.add_outline_item("Part I", 0)
    writer.add_outline_item("Chapter 1 Introduction", 0, parent=None)
    writer.add_outline_item("Chapter 2 Cells", 0, parent=None)
    writer.add_outline_item("Chapter 3 Genetics", 0, parent=None)
    buf = BytesIO()
    writer.write(buf)

    chapters = extract_toc_from_bookmarks(buf.getvalue())
    titles = [c["title"] for c in chapters]
    assert any("Chapter" in t for t in titles)
    assert len(chapters) >= 3


def test_extract_toc_from_numbered_list_blog_style():
    titles = [
        "Who's Frying Baloney?",
        "Seeking Poppy Joe",
        "The Scientist's Dichotomy",
        "The Thin Veil of Halloween",
        "Ghostly Formations in New England",
    ]
    toc_lines = "\n".join(f"{i + 1} {t} .............. {i + 1}" for i, t in enumerate(titles))
    text = f"Contents\n{toc_lines}\n\n" + ("Body paragraph. " * 2000)
    chapters = extract_toc_from_numbered_list(text)
    assert len(chapters) == 5
    assert chapters[0]["title"] == "Who's Frying Baloney?"
    assert chapters[4]["title"] == "Ghostly Formations in New England"


def test_body_headings_finds_many_sections():
    parts = []
    titles = [
        "Who's Frying Baloney?",
        "Seeking Poppy Joe",
        "The Scientist's Dichotomy",
        "The Thin Veil of Halloween",
        "Ghostly Formations in New England",
        "The Orbs of Heart Pond Cemetery",
        "Faces in the Trees",
        "Haunted Massachusetts and New Hampshire",
    ]
    for t in titles:
        parts.append(f"\n\n{t}\n\n")
        parts.append("Some essay content here. " * 80)
    text = "".join(parts)
    from toc_extraction import extract_toc_from_body_headings

    chapters = extract_toc_from_body_headings(text)
    assert len(chapters) >= 7
    assert chapters[0]["title"] == "Who's Frying Baloney?"


def test_chapter_markers_multiline_full_document():
    from toc_extraction import extract_toc_from_chapter_markers

    parts = []
    titles = [
        "Who's Frying Baloney?",
        "Seeking Poppy Joe",
        "The Scientist's Dichotomy",
        "The Thin Veil of Halloween",
        "Ghostly Formations in New England",
    ]
    for i, t in enumerate(titles, 1):
        parts.append(f"\n\nCh. {i}\n{t}\n\n")
        parts.append("Essay body content here. " * 40)
    text = "".join(parts)
    chapters = extract_toc_from_chapter_markers(text)
    assert len(chapters) == 5
    assert chapters[0]["title"] == "Who's Frying Baloney?"
    assert chapters[2]["title"] == "The Scientist's Dichotomy"


@patch("toc_extraction.extract_toc_with_ai", return_value=[
    {"chapter_number": 1, "title": "Only One", "subtopics": []},
    {"chapter_number": 2, "title": "Only Two", "subtopics": []},
])
def test_pipeline_prefers_structural_when_ai_undercounts(mock_ai):
    titles = [f"Essay Title Number {i}" for i in range(1, 12)]
    text = "Contents\n" + "\n".join(f"{i} {t} .... {i}" for i, t in enumerate(titles, 1))
    text += "\n\n" + ("content " * 3000)
    writer = PdfWriter()
    writer.add_blank_page(200, 200)
    buf = BytesIO()
    writer.write(buf)

    chapters, method, _ = extract_toc_from_pdf_bytes(
        buf.getvalue(),
        title="Blog Book",
        author="Author",
        full_text=text,
    )
    mock_ai.assert_called_once()
    assert len(chapters) >= 10, f"got {len(chapters)} via {method}"
    assert method == "numbered_list"


@patch("toc_extraction.extract_toc_with_ai", return_value=[])
def test_pipeline_falls_back_to_heuristics_when_ai_empty(mock_ai):
    text = """
    Contents
    Chapter 1  Alpha ........ 1
    Chapter 2  Beta ......... 12
    Chapter 3  Gamma ........ 24
    Chapter 4  Delta ........ 36
    Chapter 5  Epsilon ...... 48
    Chapter 6  Zeta ......... 60
    """ + ("Body text. " * 500)
    writer = PdfWriter()
    for _ in range(3):
        writer.add_blank_page(200, 200)
    writer.add_outline_item("Part I", 0)
    writer.add_outline_item("Part II", 1)
    writer.add_outline_item("Part III", 2)
    buf = BytesIO()
    writer.write(buf)

    chapters, method, _ai_err = extract_toc_from_pdf_bytes(
        buf.getvalue(),
        title="Test Book",
        author="Author",
        full_text=text,
    )
    mock_ai.assert_called_once()
    assert len(chapters) >= 5, f"got {len(chapters)} via {method}: {chapters}"


@patch("toc_extraction.extract_toc_with_ai", return_value=CAFIA_TOC)
def test_pipeline_prefers_ai_over_sparse_bookmarks(mock_ai):
    text = "Executive Summary\nAbout CAFIA and Policy Implications\n" + ("content " * 1000)
    writer = PdfWriter()
    writer.add_blank_page(200, 200)
    writer.add_outline_item("Part I", 0)
    writer.add_outline_item("Part II", 1)
    buf = BytesIO()
    writer.write(buf)

    chapters, method, _ai_err = extract_toc_from_pdf_bytes(
        buf.getvalue(),
        title="CAFIA Report",
        author="Author",
        full_text=text,
    )
    mock_ai.assert_called_once()
    assert method == "ai"
    assert len(chapters) == 5
    assert chapters[0]["title"] == "Executive Summary"
    assert chapters[-1]["title"] == "Appendix A: Full Statistical Tables"
