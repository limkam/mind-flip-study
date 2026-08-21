"""Book CRUD and presigned S3 upload URLs (Section 4)."""

from __future__ import annotations

import logging
import secrets
import uuid
from pathlib import PurePosixPath
from typing import Annotated
from uuid import UUID

from botocore.exceptions import ClientError
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from database import get_db
from dependencies import get_current_user
from models.book import Book
from models.enums import BookStatus
from models.user import User
from models.usage_event import UsageEvent
from s3_service import (
    S3ConfigurationError,
    build_s3_https_url,
    generate_presigned_put_url,
    get_object_bytes,
    head_object_content_length,
)
from s3_cleanup import delete_book_s3_assets
from services.book_deletion import cascade_delete_book
from services.book_duplicate import PDF_SHA256_EXTRAS_KEY, find_duplicate_books, pdf_sha256
from services.chapter_cards import chapter_card_counts_for_book
from services.toc_editor import normalize_toc_chapters, validate_toc_chapters
from services import credits as credits_service
from services.entitlements import can_user_do, Action as EntitlementAction
from services.usage_events import BOOK_UPLOADED, current_period_start, record_usage
from schemas.book import (
    BookCreate,
    BookListPage,
    BookOut,
    BookPatch,
    BookUploadUrlRequest,
    BookUploadUrlResponse,
    CheckDuplicateResponse,
    DetectMetadataRequest,
    DetectMetadataResponse,
    DuplicateBookMatch,
    ExtractTocRequest,
    ExtractTocResponse,
    TocUpdateRequest,
    ValidatePdfRequest,
    ValidatePdfResponse,
)
from schemas.job import JobEnqueueResponse
from schemas.pagination import total_pages
from pdf_metadata import title_from_upload_filename
from pdf_text import IMAGE_ONLY_PDF_MESSAGE, MAX_UPLOAD_SIZE_BYTES, pdf_is_likely_image_only
from tasks.book_tasks import extract_book_toc_task
from toc_extraction import extract_toc_from_pdf_bytes

router = APIRouter(tags=["books"])
logger = logging.getLogger(__name__)

_IN_PROGRESS_TOC_PHASES = frozenset({
    "extracting_contents",
    "analyzing_structure",
    "extracting_toc",
})

_BOOK_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
_BOOK_CODE_LENGTH = 8


def _book_processing(book: Book) -> dict:
    return dict((book.extras or {}).get("processing") or {})


def _new_book_code() -> str:
    return "MF-" + "".join(
        secrets.choice(_BOOK_CODE_ALPHABET) for _ in range(_BOOK_CODE_LENGTH)
    )


async def _unique_book_code(db: AsyncSession) -> str:
    """Generate a book_code guaranteed unique by the DB constraint; this loop only
    avoids an unnecessary round-trip to that constraint on the (astronomically rare) collision."""
    code = _new_book_code()
    for _ in range(5):
        exists = await db.execute(select(Book.id).where(Book.book_code == code))
        if exists.scalar_one_or_none() is None:
            return code
        code = _new_book_code()
    return code


def _enqueue_toc_extraction_for_book(book: Book, *, allow_retry: bool = False) -> str:
    """
    Start async TOC extraction via the existing Celery task.
    Idempotent while a job is already in progress (returns the same job_id).
    """
    extras = dict(book.extras or {})
    proc = dict(extras.get("processing") or {})
    phase = str(proc.get("phase") or "")
    existing_job = proc.get("job_id")

    if phase in _IN_PROGRESS_TOC_PHASES and existing_job:
        return str(existing_job)

    toc = extras.get("table_of_contents") or []
    if not allow_retry and toc and phase == "complete":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Table of contents already extracted",
        )

    task = extract_book_toc_task.delay(str(book.id))
    proc = {
        "phase": "extracting_contents",
        "kind": "toc_extraction",
        "job_id": task.id,
    }
    extras["processing"] = proc
    book.extras = extras
    logger.info("toc_extraction_enqueued", extra={"book_id": str(book.id), "job_id": task.id})
    return task.id


def _user_book_prefix(user_id: UUID) -> str:
    return f"books/{user_id}/"


def _sanitize_filename(filename: str) -> str:
    name = PurePosixPath(filename).name
    if not name or name in (".", ".."):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid filename",
        )
    return name


def _assert_key_owned_by_user(*, s3_key: str, user_id: UUID) -> None:
    prefix = _user_book_prefix(user_id)
    if not s3_key.startswith(prefix):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="s3_key does not belong to the current user",
        )


ALLOWED_EXTENSIONS = (".pdf", ".docx", ".pptx")

@router.post("/upload-url", response_model=BookUploadUrlResponse)
async def create_upload_url(
    body: BookUploadUrlRequest,
    current_user: Annotated[User, Depends(get_current_user)],
) -> BookUploadUrlResponse:
    # Not logged as a guardrail event here — this is just a pre-check ahead of requesting a
    # presigned URL, the client may never actually attempt the upload. The authoritative
    # rejection (and where it's logged) is POST /books, once the file actually lands in S3.
    safe_name = _sanitize_filename(body.filename)
    if not safe_name.lower().endswith(ALLOWED_EXTENSIONS):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported document format. Please upload a PDF (.pdf), Word (.docx), or PowerPoint (.pptx) file.",
        )
    if body.file_size_bytes > MAX_UPLOAD_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The selected file exceeds the 20 MB upload limit. Please upload a smaller document.",
        )
    try:
        key = f"{_user_book_prefix(current_user.id)}{uuid.uuid4()}/{safe_name}"
        upload_url = generate_presigned_put_url(key=key, content_type=body.content_type)
        return BookUploadUrlResponse(upload_url=upload_url, s3_key=key, expires_in=3600)
    except S3ConfigurationError as exc:
        logger.warning("S3 configuration error for user %s: %s", current_user.id, exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "error": "Failed to generate upload URL",
                "detail": str(exc),
            },
        ) from exc
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("upload-url failed for user %s", current_user.id)
        detail = str(exc) if settings.ENVIRONMENT == "development" else "Upload service error"
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error": "Failed to generate upload URL",
                "detail": detail,
            },
        ) from exc


def _fetch_uploaded_pdf(*, s3_key: str, expected_size: int) -> bytes:
    """Single S3 download for upload validation (avoids redundant head + get)."""
    try:
        pdf_bytes = get_object_bytes(s3_key)
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code", "")
        if code in ("404", "403", "NoSuchKey", "NotFound"):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="S3 object not found") from exc
        raise
    if not pdf_bytes:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="S3 object not found")
    if len(pdf_bytes) != expected_size:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="file_size_bytes does not match object size in S3",
        )
    return pdf_bytes


@router.post("/validate-pdf", response_model=ValidatePdfResponse)
async def validate_pdf_upload(
    body: ValidatePdfRequest,
    current_user: Annotated[User, Depends(get_current_user)],
) -> ValidatePdfResponse:
    """Check whether an uploaded PDF has extractable text (reject scanned photos)."""
    _assert_key_owned_by_user(s3_key=body.s3_key, user_id=current_user.id)
    try:
        pdf_bytes = get_object_bytes(body.s3_key)
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code", "")
        if code in ("404", "403", "NoSuchKey", "NotFound"):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="S3 object not found") from exc
        raise
    if pdf_is_likely_image_only(pdf_bytes, filename=body.s3_key):
        return ValidatePdfResponse(ok=False, message=IMAGE_ONLY_PDF_MESSAGE)
    return ValidatePdfResponse(ok=True)


@router.post("/extract-toc", response_model=ExtractTocResponse)
async def extract_toc_from_upload(
    body: ExtractTocRequest,
    current_user: Annotated[User, Depends(get_current_user)],
) -> ExtractTocResponse:
    """Extract TOC from PDF text in S3 (used by mobile/web after presigned upload)."""
    _assert_key_owned_by_user(s3_key=body.s3_key, user_id=current_user.id)
    if head_object_content_length(body.s3_key) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="S3 object not found")
    try:
        pdf_bytes = get_object_bytes(body.s3_key)
        chapters, _method, _ = extract_toc_from_pdf_bytes(
            pdf_bytes,
            title=body.title,
            author=body.author,
            description=body.description,
            user_id=current_user.id,
        )
        return ExtractTocResponse(chapters=chapters, method=_method)
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Anthropic API not configured",
        ) from exc
    except Exception as exc:
        logger.exception("extract-toc failed for user %s", current_user.id)
        detail = str(exc) if settings.ENVIRONMENT == "development" else "TOC extraction failed"
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=detail) from exc


@router.post("/detect-metadata", response_model=DetectMetadataResponse)
async def detect_metadata_from_filename(
    body: DetectMetadataRequest,
    current_user: Annotated[User, Depends(get_current_user)],
) -> DetectMetadataResponse:
    """Prefill upload title from the PDF file name. Author is entered manually."""
    filename = body.filename.strip()
    if not filename.lower().endswith(ALLOWED_EXTENSIONS):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported document format. Please upload a PDF (.pdf), Word (.docx), or PowerPoint (.pptx) file.")
    title = title_from_upload_filename(filename)
    return DetectMetadataResponse(
        title=title,
        author="",
        title_detected=bool(title),
        author_detected=False,
    )


@router.get("/check-duplicate", response_model=CheckDuplicateResponse)
async def check_duplicate_book(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    title: str = Query(..., min_length=1, max_length=512),
    file_sha256: str | None = Query(None, min_length=64, max_length=64),
    file_size_bytes: int | None = Query(None, gt=0),
) -> CheckDuplicateResponse:
    """Check if this book title or PDF already exists in the user's library."""
    want_hash = (file_sha256 or "").strip().lower() or None
    matches = await find_duplicate_books(
        db,
        user_id=current_user.id,
        title=title,
        file_sha256=want_hash,
        file_size_bytes=file_size_bytes,
        fetch_pdf=_fetch_uploaded_pdf if want_hash and file_size_bytes else None,
    )
    normalized_title = title.strip().lower()

    def match_reason(book: Book) -> str:
        if want_hash:
            stored = (book.extras or {}).get(PDF_SHA256_EXTRAS_KEY)
            if isinstance(stored, str) and stored.lower() == want_hash:
                return "file"
            if file_size_bytes and book.file_size_bytes == file_size_bytes:
                return "file"
        if book.title.strip().lower() == normalized_title:
            return "title"
        return "title"

    return CheckDuplicateResponse(
        is_duplicate=len(matches) > 0,
        matches=[
            DuplicateBookMatch(
                id=b.id,
                title=b.title,
                author=b.author,
                created_at=b.created_at,
                file_size_bytes=b.file_size_bytes,
                match_reason=match_reason(b),
            )
            for b in matches
        ],
    )


@router.post("/", response_model=BookOut, status_code=status.HTTP_201_CREATED)
async def create_book(
    body: BookCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> BookOut:
    # Never trust client-supplied s3_key: must match this user's prefix (same as presign path).
    _assert_key_owned_by_user(s3_key=body.s3_key, user_id=current_user.id)

    replacement: Book | None = None
    if body.replace_book_id is not None:
        result = await db.execute(
            select(Book).where(Book.id == body.replace_book_id, Book.user_id == current_user.id),
        )
        replacement = result.scalar_one_or_none()
        if replacement is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Book to replace not found")

    if body.file_size_bytes > MAX_UPLOAD_SIZE_BYTES:
        from models.security_events import SystemSecurityEvent

        db.add(
            SystemSecurityEvent(
                event_type="book_size_exceeded",
                user_id=current_user.id,
                detail=f"{body.file_size_bytes} bytes (limit {MAX_UPLOAD_SIZE_BYTES})",
            )
        )
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The selected file exceeds the 20 MB upload limit. Please upload a smaller document.",
        )
    doc_bytes = _fetch_uploaded_pdf(s3_key=body.s3_key, expected_size=body.file_size_bytes)
    if pdf_is_likely_image_only(doc_bytes, filename=body.s3_key):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=IMAGE_ONLY_PDF_MESSAGE,
        )

    content_hash = pdf_sha256(doc_bytes)
    if body.replace_book_id is None:
        duplicates = await find_duplicate_books(
            db,
            user_id=current_user.id,
            title=body.title,
            file_sha256=content_hash,
            file_size_bytes=body.file_size_bytes,
            fetch_pdf=_fetch_uploaded_pdf,
        )
        if duplicates:
            existing = duplicates[0]
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f'This document is already in your library as "{existing.title}" '
                    f"by {existing.author}. Open that book instead of uploading again."
                ),
            )

    # Serialize allowance checks and event creation for this user.
    await db.execute(select(User.id).where(User.id == current_user.id).with_for_update())
    if body.operation_id is not None:
        prior = await db.scalar(
            select(UsageEvent).where(UsageEvent.idempotency_key == f"book-upload:{body.operation_id}")
        )
        if prior is not None:
            existing_book = await db.get(Book, prior.resource_id)
            if existing_book is not None and existing_book.user_id == current_user.id:
                return BookOut.model_validate(existing_book)
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This upload operation was already completed and its usage remains consumed.",
            )
    ent = await can_user_do(db, current_user, EntitlementAction.CREATE_BOOK)
    if not ent.get("allowed"):
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail={
                "code": "UPGRADE_REQUIRED",
                "message": "Your plan's book allowance has been reached.",
                "reason": ent.get("reason"),
                "upgrade_hook": ent.get("upgrade_hook"),
            },
        )
    consume = ent.get("consume")
    if consume:
        await credits_service.consume_credits(
            db,
            current_user.id,
            int(consume.get("amount", 1)),
            pool=str(consume.get("pool", "content")),
            reason="create_book",
        )

    book = Book(
        user_id=current_user.id,
        title=body.title.strip(),
        author=body.author.strip(),
        s3_key=body.s3_key,
        s3_url=build_s3_https_url(body.s3_key),
        file_size_bytes=body.file_size_bytes,
        book_code=await _unique_book_code(db),
        status=BookStatus.ready,
        extras=body.extras if body.extras is not None else {},
    )
    if book.extras is not None:
        merged = dict(book.extras)
        merged.setdefault("table_of_contents", [])
        merged["thumbnail"] = {"status": "processing"}
        merged[PDF_SHA256_EXTRAS_KEY] = content_hash
        book.extras = merged
    db.add(book)
    await db.flush()
    await record_usage(
        db,
        user_id=current_user.id,
        event_type=BOOK_UPLOADED,
        resource_type="book",
        resource_id=book.id,
        period_start=current_period_start(lifetime=False),
        idempotency_key=f"book-upload:{body.operation_id or book.id}",
        metadata={"operation_id": str(body.operation_id)} if body.operation_id else None,
    )
    if replacement is not None:
        await cascade_delete_book(db, replacement, commit=False, delete_assets=False)
    _enqueue_toc_extraction_for_book(book)
    await db.commit()
    if replacement is not None:
        delete_book_s3_assets(s3_key=replacement.s3_key, extras=replacement.extras)
    await db.refresh(book)
    return BookOut.model_validate(book)


@router.get("/", response_model=BookListPage)
async def list_books(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=100),
) -> BookListPage:
    total = int(
        await db.scalar(
            select(func.count()).select_from(Book).where(Book.user_id == current_user.id),
        )
        or 0,
    )
    offset = (page - 1) * size
    result = await db.execute(
        select(Book)
        .where(Book.user_id == current_user.id)
        .order_by(Book.created_at.desc())
        .offset(offset)
        .limit(size),
    )
    rows = result.scalars().all()
    items = [BookOut.model_validate(b) for b in rows]
    has_more = page * size < total
    return BookListPage(
        items=items,
        page=page,
        size=size,
        total=total,
        has_more=has_more,
        total_pages=total_pages(total=total, size=size),
    )


@router.get("/{book_id}", response_model=BookOut)
async def get_book(
    book_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> BookOut:
    result = await db.execute(
        select(Book).where(Book.id == book_id, Book.user_id == current_user.id),
    )
    book = result.scalar_one_or_none()
    if book is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Book not found")
    counts = await chapter_card_counts_for_book(
        db,
        book_id=book.id,
        user_id=current_user.id,
    )
    return BookOut.model_validate(book).model_copy(update={"chapter_card_counts": counts})


@router.get("/{book_id}/thumbnail")
async def get_book_thumbnail(
    book_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    """Return a private cached preview only to the document owner."""
    book = await db.scalar(
        select(Book).where(Book.id == book_id, Book.user_id == current_user.id)
    )
    if book is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Book not found")
    thumbnail = (book.extras or {}).get("thumbnail") or {}
    key = thumbnail.get("s3_key") if thumbnail.get("status") == "ready" else None
    if not key:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Thumbnail not available")
    try:
        content = get_object_bytes(str(key))
    except Exception:
        logger.warning("book_thumbnail_fetch_failed", extra={"book_id": str(book.id)})
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Thumbnail not available") from None
    return Response(
        content=content,
        media_type=str(thumbnail.get("content_type") or "image/png"),
        headers={"Cache-Control": "private, max-age=86400"},
    )


@router.post("/{book_id}/extract-toc", response_model=JobEnqueueResponse, status_code=status.HTTP_202_ACCEPTED)
async def extract_toc_for_book(
    book_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> JobEnqueueResponse:
    """User-triggered TOC extraction from book detail."""
    result = await db.execute(
        select(Book).where(Book.id == book_id, Book.user_id == current_user.id),
    )
    book = result.scalar_one_or_none()
    if book is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Book not found")

    job_id = _enqueue_toc_extraction_for_book(book, allow_retry=True)
    await db.commit()
    return JobEnqueueResponse(job_id=job_id, message="TOC extraction started")


@router.patch("/{book_id}/toc", response_model=BookOut)
async def update_book_toc(
    book_id: UUID,
    body: TocUpdateRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> BookOut:
    """Persist user-edited table of contents."""
    result = await db.execute(
        select(Book).where(Book.id == book_id, Book.user_id == current_user.id),
    )
    book = result.scalar_one_or_none()
    if book is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Book not found")

    extras = dict(book.extras or {})
    raw = [ch.model_dump() for ch in body.chapters]
    chapters = normalize_toc_chapters(raw)
    try:
        validate_toc_chapters(chapters, total_length=extras.get("toc_text_length") or None)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    extras["table_of_contents"] = chapters
    extras["toc_edited"] = True
    extras["toc_extraction_method"] = extras.get("toc_extraction_method") or "user_edited"
    book.extras = extras
    await db.commit()
    await db.refresh(book)
    return BookOut.model_validate(book)


@router.patch("/{book_id}", response_model=BookOut)
async def patch_book(
    book_id: UUID,
    body: BookPatch,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> BookOut:
    result = await db.execute(
        select(Book).where(Book.id == book_id, Book.user_id == current_user.id),
    )
    book = result.scalar_one_or_none()
    if book is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Book not found")
    if body.extras is not None:
        merged = dict(book.extras or {})
        merged.update(body.extras)
        book.extras = merged
    await db.commit()
    await db.refresh(book)
    return BookOut.model_validate(book)


@router.delete("/{book_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_book(
    book_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    result = await db.execute(
        select(Book).where(Book.id == book_id, Book.user_id == current_user.id),
    )
    book = result.scalar_one_or_none()
    if book is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Book not found")

    await cascade_delete_book(db, book)
