"""TOC extraction heuristics."""

import re
import pytest
from unittest.mock import patch
from types import SimpleNamespace

from toc_extraction import (
    _align_chapter_titles,
    _strip_page_number,
    extract_toc_from_bookmarks,
    extract_toc_from_text,
    extract_toc_from_numbered_list,
    extract_toc_from_pdf_bytes,
    extract_toc_with_ai,
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


def _anthropic_response(payload: str):
    return SimpleNamespace(
        messages=SimpleNamespace(
            create=lambda **_kwargs: SimpleNamespace(content=[SimpleNamespace(text=payload)]),
        ),
    )


@patch("toc_extraction.get_anthropic_client")
def test_ai_toc_detector_returns_nothing_when_no_authored_toc(mock_client):
    mock_client.return_value = _anthropic_response('{"toc_found": false}')
    assert extract_toc_with_ai("[PAGE 1]\nCopyright\n[PAGE 2]\nDedication", title="Book", author="Author") == []


@patch("toc_extraction.get_anthropic_client")
def test_ai_toc_detector_returns_conservative_generated_structure(mock_client):
    mock_client.return_value = _anthropic_response(
        '{"toc_found":false,"entries":['
        '{"level":1,"title":"Chapter 1","page":9},'
        '{"level":1,"title":"Chapter 2","page":27}'
        ']}'
    )
    chapters = extract_toc_with_ai("[PAGE 9]\nChapter 1\n[PAGE 27]\nChapter 2", title="Book", author="Author")
    assert [c["title"] for c in chapters] == ["Chapter 1", "Chapter 2"]
    assert all(c["authored_toc"] is False for c in chapters)


@patch("toc_extraction.get_anthropic_client")
def test_ai_toc_detector_preserves_hierarchy_titles_and_pages(mock_client):
    mock_client.return_value = _anthropic_response(
        '{"toc_found":true,"entries":['
        '{"level":1,"title":"PART I — Foundations","page":1},'
        '{"level":2,"title":"1. Why Study?","page":3},'
        '{"level":3,"title":"A question without a printed page","page":null}'
        ']}'
    )
    chapters = extract_toc_with_ai("[PAGE 1]\nContents", title="Book", author="Author")
    assert [(c["level"], c["title"], c["page"]) for c in chapters] == [
        (1, "PART I — Foundations", 1),
        (2, "1. Why Study?", 3),
        (3, "A question without a printed page", None),
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


def test_extract_toc_from_text_continues_past_blank_gaps():
    lines = ["Table of Contents"]
    for i in range(1, 13):
        lines.append(f"Chapter {i}  Topic Number {i} .............. {i}")
        if i == 5:
            lines.extend([""] * 15)
    text = "\n".join(lines) + "\n\n" + ("Body paragraph. " * 200)
    chapters = extract_toc_from_text(text)
    assert len(chapters) == 12, f"expected 12 chapters, got {len(chapters)}"
    assert chapters[11]["title"] == "Topic Number 12"


def test_content_word_in_bibliography_url_is_not_a_toc_heading():
    text = "\n".join(
        [
            "Executive Summary",
            "1 Access to digital finance is widespread but active usage remains limited.",
            "2 Mobile money functions mainly as a payment receipt channel.",
            *("Report body paragraph" for _ in range(150)),
            "https://www.ifc.org/content/dam/ifc/doc/report.pdf",
            "3 References and citations",
        ]
    )
    assert extract_toc_from_text(text) == []


def test_extract_toc_from_text_skips_subsections():
    text = """
    Contents
    Chapter 1  Introduction .............. 1
    1.1 Background ....................... 2
    1.2 Scope ............................ 5
    Chapter 2  Methods ................... 10
    2.1 Study Design ..................... 11
    """
    chapters = extract_toc_from_text(text)
    assert len(chapters) == 2
    assert chapters[0]["title"] == "Introduction"
    assert chapters[1]["title"] == "Methods"
    assert chapters[0]["subtopics"] == []
    assert chapters[1]["subtopics"] == []


def test_extract_toc_from_text_academic_eight_main_chapters():
    lines = ["Contents"]
    mains = [
        "Logic. Language of Proof",
        "Sets",
        "Properties of N",
        "Relations, Functions, and Orders",
        "Construction of the Standard Number Systems",
        "Topology on the Real Line",
        "The Sets F(X, Y ), X, Y ⊆ R",
        "Cantor's Real Numbers",
    ]
    for i, title in enumerate(mains, 1):
        lines.append(f"{i} {title} . . . . . . . . . . . . . . . . . . . . {i * 5}")
        lines.append(f"{i}.1 Subsection Alpha . . . . . . . . . . . . . . . . {i * 5 + 1}")
        lines.append(f"{i}.2 Subsection Beta . . . . . . . . . . . . . . . . {i * 5 + 2}")
    text = "\n".join(lines)
    chapters = extract_toc_from_text(text)
    assert len(chapters) == 8, f"expected 8 main chapters, got {len(chapters)}: {chapters}"
    assert all(c["subtopics"] == [] for c in chapters)
    assert "Logic" in chapters[0]["title"]
    assert "Cantor" in chapters[7]["title"]


def test_strip_page_number_from_inline_page():
    assert _strip_page_number("Sets 22") == "Sets"
    assert _strip_page_number("Logic. Language of Proof 5") == "Logic. Language of Proof"
    assert _strip_page_number("Topology on the Real Line 99") == "Topology on the Real Line"


def test_extract_toc_ignores_stray_page_lines_and_inline_pages():
    lines = ["Contents"]
    mains = [
        "Logic. Language of Proof",
        "Sets",
        "Properties of N",
        "Relations, Functions, and Orders",
        "Construction of the Standard Number Systems",
        "Topology on the Real Line",
        "The Sets F(X, Y ), X, Y ⊆ R",
        "Cantor's Real Numbers",
    ]
    pages = [5, 22, 31, 43, 77, 99, 114, 123]
    for i, (title, page) in enumerate(zip(mains, pages), 1):
        lines.append(f"{i} {title} {page}")
        lines.append(f"{i}.1 Subsection . . . . . . . . . . . . . . . . . . . . {page + 1}")
        lines.append(str(page))
    text = "\n".join(lines)
    chapters = extract_toc_from_text(text)
    assert len(chapters) == 8, f"expected 8, got {len(chapters)}: {chapters}"
    assert chapters[1]["title"] == "Sets"
    assert chapters[5]["title"] == "Topology on the Real Line"
    assert not any(re.search(r"\s\d{1,3}$", c["title"]) for c in chapters)


def test_bookmarks_nested_outline_subtopics():
    writer = PdfWriter()
    writer.add_blank_page(200, 200)
    part = writer.add_outline_item("Part I", 0)
    ch1 = writer.add_outline_item("Chapter 1 Introduction", 0, parent=part)
    writer.add_outline_item("1.1 Overview", 0, parent=ch1)
    writer.add_outline_item("1.2 History", 0, parent=ch1)
    ch2 = writer.add_outline_item("Chapter 2 Cells", 0, parent=part)
    writer.add_outline_item("2.1 Membrane", 0, parent=ch2)
    buf = BytesIO()
    writer.write(buf)

    chapters = extract_toc_from_bookmarks(buf.getvalue())
    assert len(chapters) >= 2
    titles = [c["title"] for c in chapters]
    assert any("Chapter 1" in t for t in titles)
    ch1_entry = next(c for c in chapters if "Chapter 1" in c["title"])
    assert ch1_entry.get("subtopics", []) == []


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
    mock_ai.assert_not_called()
    assert len(chapters) >= 10, f"got {len(chapters)} via {method}"
    assert method in ("numbered_list", "toc_text")


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
    # Native TOC text parses all six chapters — no AI call needed.
    mock_ai.assert_not_called()
    assert len(chapters) >= 5, f"got {len(chapters)} via {method}: {chapters}"
    assert method in ("toc_text", "bookmarks", "numbered_list", "chapter_markers")


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
    # Sparse PDF bookmarks; pipeline should use structural/AI path — not assert AI if native TOC wins.
    assert len(chapters) >= 2
    assert method in ("ai", "toc_text", "numbered_list", "body_headings", "chapter_markers", "bookmarks")


WEAK_HEADINGS = [
    {"chapter_number": i, "title": f"Sparse Heading {i}", "subtopics": []}
    for i in range(1, 6)
]


@patch("toc_extraction._best_native_toc", return_value=([], "none"))
@patch("toc_extraction._structural_toc_candidates", return_value=(WEAK_HEADINGS, "headings"))
@patch("toc_extraction.extract_toc_with_ai")
def test_pipeline_calls_ai_for_weak_headings(mock_ai, _mock_structural, _mock_native):
    ai_chapters = [
        {
            "chapter_number": i,
            "title": f"Full Chapter {i}",
            "subtopics": [f"Section {i}.1"],
            "authored_toc": True,
        }
        for i in range(1, 16)
    ]
    mock_ai.return_value = ai_chapters
    text = "Contents\n" + ("Document body. " * 5000)
    writer = PdfWriter()
    writer.add_blank_page(200, 200)
    buf = BytesIO()
    writer.write(buf)

    chapters, method, ai_err = extract_toc_from_pdf_bytes(
        buf.getvalue(),
        title="Long Book",
        author="Author",
        full_text=text,
    )
    mock_ai.assert_called_once()
    assert ai_err is None
    assert method == "ai"
    assert len(chapters) == 15
    assert chapters[0]["subtopics"] == ["Section 1.1"]


@patch("toc_extraction._best_native_toc", return_value=([], "none"))
@patch("toc_extraction._structural_toc_candidates", return_value=(WEAK_HEADINGS, "headings"))
@patch(
    "toc_extraction.extract_toc_with_ai",
    side_effect=RuntimeError("ANTHROPIC_API_KEY is not configured"),
)
def test_pipeline_falls_back_to_headings_when_ai_fails(mock_ai, _mock_structural, _mock_native):
    text = "Document body. " * 500
    writer = PdfWriter()
    writer.add_blank_page(200, 200)
    buf = BytesIO()
    writer.write(buf)

    chapters, method, ai_err = extract_toc_from_pdf_bytes(
        buf.getvalue(),
        title="Short Book",
        author="Author",
        full_text=text,
    )
    mock_ai.assert_called_once()
    assert method == "headings"
    assert len(chapters) == 5
    assert ai_err is not None
    assert "ANTHROPIC" in ai_err


@patch("toc_extraction._best_native_toc", return_value=([], "none"))
@patch("toc_extraction._structural_toc_candidates", return_value=(WEAK_HEADINGS, "headings"))
@patch(
    "toc_extraction.extract_toc_with_ai",
    side_effect=RuntimeError("ANTHROPIC_API_KEY is not configured"),
)
def test_pipeline_raises_on_long_doc_when_ai_fails(mock_ai, _mock_structural, _mock_native):
    text = "Document body. " * 5000
    writer = PdfWriter()
    writer.add_blank_page(200, 200)
    buf = BytesIO()
    writer.write(buf)

    with pytest.raises(RuntimeError, match="ANTHROPIC_API_KEY"):
        extract_toc_from_pdf_bytes(
            buf.getvalue(),
            title="Long Book",
            author="Author",
            full_text=text,
        )
    mock_ai.assert_called_once()
