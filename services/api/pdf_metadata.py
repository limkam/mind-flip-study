"""Extract document metadata from PDF properties, XMP, and first pages."""

from __future__ import annotations

import logging
import re
from io import BytesIO
from pathlib import PurePosixPath
from typing import Any

from pypdf import PdfReader

from ai_generation import parse_model_json
from anthropic_client import CLAUDE_SONNET_MODEL, get_anthropic_client
from pdf_text import extract_pdf_text

log = logging.getLogger(__name__)

METADATA_INFERENCE_SYSTEM = """You infer bibliographic metadata from the first pages of a document.
Respond with JSON only:
{
  "title": "...",
  "authors": ["..."],
  "subject": "...",
  "edition": "...",
  "publisher": "...",
  "publication_year": "..."
}
Use empty strings or empty arrays when unknown. Do not invent details not supported by the text."""


def _clean(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _merge_field(existing: str, new: str) -> str:
    return existing if existing else _clean(new)


def extract_pdf_document_metadata(pdf_bytes: bytes) -> dict[str, Any]:
    """Read PDF Info dictionary and XMP metadata."""
    reader = PdfReader(BytesIO(pdf_bytes))
    meta = reader.metadata

    title = ""
    author = ""
    subject = ""
    creator = ""
    producer = ""
    year = ""

    if meta is not None:
        title = _clean(getattr(meta, "title", None) or meta.get("/Title") or meta.get("Title"))
        author = _clean(getattr(meta, "author", None) or meta.get("/Author") or meta.get("Author"))
        subject = _clean(getattr(meta, "subject", None) or meta.get("/Subject") or meta.get("Subject"))
        creator = _clean(getattr(meta, "creator", None) or meta.get("/Creator") or meta.get("Creator"))
        producer = _clean(getattr(meta, "producer", None) or meta.get("/Producer") or meta.get("Producer"))
        for key in ("creation_date", "/CreationDate", "CreationDate"):
            raw = ""
            if hasattr(meta, "creation_date") and key == "creation_date":
                cd = meta.creation_date
                raw = str(cd) if cd else ""
            else:
                raw = _clean(meta.get(key))
            m = re.search(r"(19|20)\d{2}", raw)
            if m:
                year = m.group(0)
                break

    # XMP (common in books from publishers / Google Books exports)
    try:
        xmp = reader.xmp_metadata
        if xmp is not None:
            dc_title = xmp.dc_title
            if dc_title and isinstance(dc_title, dict):
                title = _merge_field(title, dc_title.get("x-default") or next(iter(dc_title.values()), ""))
            elif dc_title:
                title = _merge_field(title, str(dc_title))

            creators = xmp.dc_creator
            if creators and isinstance(creators, list) and creators:
                author = _merge_field(author, ", ".join(_clean(c) for c in creators if _clean(c)))
            elif creators:
                author = _merge_field(author, str(creators))
    except Exception as exc:
        log.debug("xmp_metadata_read_failed", extra={"error": str(exc)})

    authors: list[str] = []
    if author:
        for part in re.split(r"[,;]|(?:\s+and\s+)", author):
            name = part.strip()
            if name:
                authors.append(name)

    return {
        "title": title,
        "authors": authors,
        "author": author,
        "subject": subject,
        "edition": "",
        "publisher": creator or producer,
        "publication_year": year,
        "source": "pdf_metadata",
    }


def heuristic_metadata_from_text(full_text: str) -> dict[str, str]:
    """Fast title/author guess from cover page text — no AI required."""
    if not full_text.strip():
        return {"title": "", "author": ""}

    lines = [re.sub(r"\s+", " ", line).strip() for line in full_text[:10_000].splitlines()]
    lines = [line for line in lines if line and len(line) >= 2]

    title = ""
    author = ""
    skip = re.compile(
        r"^(copyright|©|isbn|all rights reserved|www\.|http|published by|table of contents|\d+$)",
        re.I,
    )

    for line in lines[:50]:
        m = re.match(r"^(.{4,180}?)\s+by\s+(.{2,120})$", line, re.I)
        if m:
            title = m.group(1).strip(" .,-")
            author = m.group(2).strip(" .,-")
            break

    if not author:
        for line in lines[:50]:
            m = re.match(r"^(?:written|prepared|authored)\s+by\s+(.+)$", line, re.I)
            if m:
                author = m.group(1).strip(" .,-")
                break
            m = re.match(r"^author[s]?:\s*(.+)$", line, re.I)
            if m:
                author = m.group(1).strip(" .,-")
                break

    if not title:
        for line in lines[:20]:
            if len(line) < 5 or len(line) > 220 or skip.search(line):
                continue
            if re.fullmatch(r"[\d\s\W]+", line):
                continue
            title = line
            break

    if title and not author:
        try:
            idx = lines.index(title)
            for candidate in lines[idx + 1 : idx + 8]:
                if skip.search(candidate) or len(candidate) > 120:
                    continue
                if re.match(r"^by\s+", candidate, re.I):
                    author = re.sub(r"^by\s+", "", candidate, flags=re.I).strip(" .,-")
                    break
                if 3 <= len(candidate) <= 80 and not re.search(r"\d{4}", candidate):
                    author = candidate
                    break
        except ValueError:
            pass

    return {"title": title, "author": author}


def infer_metadata_from_text(sample_text: str) -> dict[str, Any]:
    """Use Claude on cover/title-page excerpt when other methods fail."""
    if not sample_text.strip():
        return {}
    client = get_anthropic_client()
    message = client.messages.create(
        model=CLAUDE_SONNET_MODEL,
        max_tokens=1024,
        system=METADATA_INFERENCE_SYSTEM,
        messages=[
            {
                "role": "user",
                "content": (
                    "Infer bibliographic metadata from these first pages:\n\n"
                    f"{sample_text[:12_000]}\n\n"
                    "Return JSON only."
                ),
            },
        ],
    )
    raw = "".join(b.text for b in message.content if hasattr(b, "text"))
    data = parse_model_json(raw)
    authors = data.get("authors") or []
    if not isinstance(authors, list):
        authors = [str(authors)] if authors else []
    return {
        "title": _clean(data.get("title")),
        "authors": [_clean(a) for a in authors if _clean(a)],
        "author": ", ".join(_clean(a) for a in authors if _clean(a)),
        "subject": _clean(data.get("subject")),
        "edition": _clean(data.get("edition")),
        "publisher": _clean(data.get("publisher")),
        "publication_year": _clean(data.get("publication_year")),
        "source": "ai_inference",
    }


_PATH_LIKE_TITLE_RE = re.compile(
    r"(?:^[A-Za-z]:\\)|"  # C:\...
    r"(?:^/[^/]+/[^/]+)|"  # /Users/name or /home/name
    r"(?:\\Users\\|\\Documents\\|\\Downloads\\|/Users/|/home/)",
    re.I,
)

_UNRELIABLE_AUTHOR_NAMES = frozenset(
    {
        "admin",
        "administrator",
        "adobe",
        "asus",
        "dell",
        "hp",
        "lenovo",
        "microsoft",
        "owner",
        "pc",
        "unknown",
        "user",
        "windows",
    }
)


def _looks_like_file_path(value: str) -> bool:
    """PDF creators often store the source file path in the Title field."""
    v = (value or "").strip()
    if not v:
        return False
    if _PATH_LIKE_TITLE_RE.search(v):
        return True
    if ("/" in v or "\\" in v) and v.lower().endswith(".pdf"):
        return True
    if v.count("\\") >= 2 or (v.count("/") >= 2 and not v.startswith("http")):
        return True
    return False


def _username_from_path(path: str) -> str | None:
    for pattern in (r"[/\\]Users[/\\]([^/\\]+)", r"[/\\]home[/\\]([^/\\]+)"):
        m = re.search(pattern, path, re.I)
        if m:
            return m.group(1).strip()
    return None


def _author_looks_unreliable(author: str, *, title: str = "") -> bool:
    """Detect OS usernames / app defaults stored in PDF Author metadata."""
    a = (author or "").strip()
    if not a:
        return True
    lower = a.lower()
    if lower in _UNRELIABLE_AUTHOR_NAMES:
        return True
    if len(a) <= 2:
        return True
    if len(a) <= 4 and a.isupper() and a.isalpha():
        return True
    path_user = _username_from_path(title)
    if path_user and a.lower() == path_user.lower():
        return True
    return False


def title_from_upload_filename(filename: str) -> str:
    """Derive book title from the uploaded file name (no PDF parsing)."""
    stem = PurePosixPath(str(filename).replace("\\", "/")).stem.strip()
    if not stem or _looks_like_file_path(stem):
        return ""
    title = re.sub(r"[_-]+", " ", stem)
    title = re.sub(r"\s+", " ", title).strip()
    if not title:
        return ""
    return title[:512]


def _title_from_filename(filename: str) -> str:
    """Use a humanized basename when embedded PDF metadata is unusable."""
    title = title_from_upload_filename(filename)
    if len(title) < 3:
        return ""
    return title[:220]


def _title_looks_unreliable(title: str) -> bool:
    """Detect blog-export / PDF-metadata titles that need AI correction."""
    t = (title or "").strip()
    if not t or len(t) < 3:
        return True
    if _looks_like_file_path(t):
        return True
    lower = t.lower()
    if lower in {"untitled", "document", "microsoft word", "unknown"}:
        return True
    # e.g. "Previous - Life - Story - from - the - Truth..."
    if t.count(" - ") >= 3:
        return True
    if t.count("-") >= 6 and " " in t:
        return True
    return False


def _sanitize_embedded_metadata(title: str, author: str) -> tuple[str, str]:
    """Drop PDF Info values that are really file paths or OS usernames."""
    t = _clean(title)
    a = _clean(author)
    raw_title = t
    if _looks_like_file_path(t):
        t = ""
    elif t.lower() in {"untitled", "document", "microsoft word", "unknown"}:
        t = ""
    if _author_looks_unreliable(a, title=raw_title):
        a = ""
    return t, a


def detect_metadata_from_pdf_bytes(
    pdf_bytes: bytes,
    *,
    filename: str = "",
) -> dict[str, Any]:
    """
    Best-effort title/author detection:
    1. PDF Info + XMP
    2. First-page heuristics
    3. Claude on first pages (always when title looks unreliable or fields missing)
    """
    pdf_meta = extract_pdf_document_metadata(pdf_bytes)
    title, author = _sanitize_embedded_metadata(
        _clean(pdf_meta.get("title")),
        _clean(pdf_meta.get("author")),
    )
    source = pdf_meta.get("source", "pdf_metadata")

    sample = extract_pdf_text(pdf_bytes, max_pages=8)

    if not title or not author:
        heuristic = heuristic_metadata_from_text(sample)
        if not title:
            title = _clean(heuristic.get("title"))
        if not author:
            author = _clean(heuristic.get("author"))
        if heuristic.get("title") or heuristic.get("author"):
            source = "pdf_metadata+heuristic" if pdf_meta.get("title") or pdf_meta.get("author") else "heuristic"

    needs_ai = (not title or not author or _title_looks_unreliable(title)) and sample.strip()
    if needs_ai:
        try:
            inferred = infer_metadata_from_text(sample)
            ai_title = _clean(inferred.get("title"))
            ai_author = _clean(inferred.get("author"))
            if ai_title and (_title_looks_unreliable(title) or not title):
                title = ai_title
            elif not title:
                title = ai_title
            if ai_author and not author:
                author = ai_author
            if ai_title or ai_author:
                source = f"{source}+ai" if source else "ai_inference"
        except Exception as exc:
            log.warning("metadata_ai_inference_failed", extra={"error": str(exc)})

    if not title and filename:
        from_filename = _title_from_filename(filename)
        if from_filename:
            title = from_filename
            source = f"{source}+filename" if source else "filename"

    return {
        "title": title,
        "author": author,
        "title_detected": bool(title),
        "author_detected": bool(author),
        "source": source,
    }


def resolve_document_metadata(
    pdf_bytes: bytes,
    *,
    user_title: str = "",
    user_author: str = "",
) -> dict[str, Any]:
    """Merge detected metadata with user-provided values."""
    detected = detect_metadata_from_pdf_bytes(pdf_bytes)
    title = _clean(user_title)
    author = _clean(user_author)
    placeholder_titles = {"", "untitled", "analyzing...", "unknown", "unknown title"}
    placeholder_authors = {"", "unknown", "unknown author", "analyzing..."}

    merged = dict(detected)
    if title.lower() not in placeholder_titles:
        merged["title"] = title
    elif not merged.get("title"):
        merged["title"] = title or "Untitled"

    if author.lower() not in placeholder_authors:
        merged["author"] = author
    elif not merged.get("author"):
        merged["author"] = author or "Unknown Author"

    return merged
