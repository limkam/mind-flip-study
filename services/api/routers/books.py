"""Book CRUD and presigned S3 upload URLs (Section 4)."""

from __future__ import annotations

import logging
import uuid
from pathlib import PurePosixPath
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from database import get_db
from dependencies import enforce_tier_limit, get_current_user
from models.book import Book
from models.enums import BookStatus
from models.user import User
from s3_service import (
    S3ConfigurationError,
    build_s3_https_url,
    delete_object_key,
    generate_presigned_put_url,
    head_object_content_length,
)
from schemas.book import BookCreate, BookListPage, BookOut, BookPatch, BookUploadUrlRequest, BookUploadUrlResponse
from schemas.pagination import total_pages

router = APIRouter(tags=["books"])
logger = logging.getLogger(__name__)


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


@router.post("/upload-url", response_model=BookUploadUrlResponse)
async def create_upload_url(
    body: BookUploadUrlRequest,
    current_user: Annotated[User, Depends(get_current_user)],
) -> BookUploadUrlResponse:
    try:
        safe_name = _sanitize_filename(body.filename)
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


@router.post("/", response_model=BookOut, status_code=status.HTTP_201_CREATED)
async def create_book(
    body: BookCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[None, Depends(enforce_tier_limit("books"))],
) -> BookOut:
    # Never trust client-supplied s3_key: must match this user's prefix (same as presign path).
    _assert_key_owned_by_user(s3_key=body.s3_key, user_id=current_user.id)

    content_len = head_object_content_length(body.s3_key)
    if content_len is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="S3 object not found",
        )
    if content_len != body.file_size_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="file_size_bytes does not match object size in S3",
        )

    book = Book(
        user_id=current_user.id,
        title=body.title,
        author=body.author,
        s3_key=body.s3_key,
        s3_url=build_s3_https_url(body.s3_key),
        file_size_bytes=body.file_size_bytes,
        status=BookStatus.ready,
        extras=body.extras if body.extras is not None else {},
    )
    db.add(book)
    await db.commit()
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

    delete_object_key(book.s3_key)
    await db.execute(delete(Book).where(Book.id == book.id))
    await db.commit()
