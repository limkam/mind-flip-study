"""Persistent first-page thumbnails for supported uploaded documents."""

from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path


THUMBNAIL_CONTENT_TYPE = "image/png"
THUMBNAIL_WIDTH_PX = 720
SUPPORTED_EXTENSIONS = {".pdf", ".docx", ".pptx"}


class ThumbnailGenerationError(RuntimeError):
    pass


def _office_to_pdf(document: bytes, extension: str) -> bytes:
    with tempfile.TemporaryDirectory(prefix="bilkeys-thumbnail-") as temp_dir:
        workdir = Path(temp_dir)
        source = workdir / f"source{extension}"
        source.write_bytes(document)
        libreoffice_profile = (workdir / "libreoffice-profile").as_uri()
        try:
            completed = subprocess.run(
                [
                    "soffice",
                    f"-env:UserInstallation={libreoffice_profile}",
                    "--headless",
                    "--convert-to",
                    "pdf",
                    "--outdir",
                    temp_dir,
                    str(source),
                ],
                check=False,
                capture_output=True,
                timeout=45,
            )
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise ThumbnailGenerationError("Office preview conversion failed") from exc
        converted = workdir / "source.pdf"
        if completed.returncode != 0 or not converted.exists():
            raise ThumbnailGenerationError("Office preview conversion failed")
        return converted.read_bytes()


def generate_first_page_thumbnail(document: bytes, *, filename: str) -> bytes:
    """Render page one to a bounded PNG. Office files are converted locally first."""
    extension = Path(filename).suffix.lower()
    if extension not in SUPPORTED_EXTENSIONS:
        raise ThumbnailGenerationError("Unsupported document type")
    pdf_bytes = document if extension == ".pdf" else _office_to_pdf(document, extension)

    try:
        import pymupdf

        pdf = pymupdf.open(stream=pdf_bytes, filetype="pdf")
        if pdf.page_count < 1:
            raise ThumbnailGenerationError("Document has no pages")
        page = pdf.load_page(0)
        scale = min(2.0, THUMBNAIL_WIDTH_PX / max(float(page.rect.width), 1.0))
        pixmap = page.get_pixmap(matrix=pymupdf.Matrix(scale, scale), alpha=False)
        output = pixmap.tobytes("png")
        pdf.close()
    except ThumbnailGenerationError:
        raise
    except Exception as exc:
        raise ThumbnailGenerationError("First page could not be rendered") from exc
    if not output:
        raise ThumbnailGenerationError("First page preview was empty")
    return output
