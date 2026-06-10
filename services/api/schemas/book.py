from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from models.book import Book
from models.enums import BookStatus


class BookUploadUrlRequest(BaseModel):
    filename: str = Field(..., min_length=1, max_length=512)
    content_type: str = Field(..., min_length=1, max_length=256)
    file_size_bytes: int = Field(..., gt=0)


class BookUploadUrlResponse(BaseModel):
    upload_url: str
    s3_key: str
    expires_in: int = 3600


class ExtractTocRequest(BaseModel):
    s3_key: str = Field(..., min_length=1, max_length=1024)
    title: str = Field(..., min_length=1, max_length=512)
    author: str = Field(..., min_length=1, max_length=512)
    description: str | None = Field(None, max_length=4000)


class ExtractTocResponse(BaseModel):
    chapters: list[Any] = Field(default_factory=list)


class BookCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=512)
    author: str = Field(..., min_length=1, max_length=512)
    s3_key: str = Field(..., min_length=1, max_length=1024)
    file_size_bytes: int = Field(..., gt=0)
    extras: dict[str, Any] | None = None


class BookPatch(BaseModel):
    extras: dict[str, Any] | None = None


class BookPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    title: str
    author: str
    s3_key: str
    s3_url: str
    file_size_bytes: int
    status: BookStatus
    extras: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


class BookOut(BaseModel):
    """API shape expected by the React app (maps ``extras`` JSON)."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    title: str
    author: str
    s3_key: str
    s3_url: str
    file_size_bytes: int
    status: BookStatus
    created_at: datetime
    extras: dict[str, Any] = Field(default_factory=dict)
    file_url: str | None = None
    table_of_contents: list[Any] = Field(default_factory=list)
    tags: list[Any] = Field(default_factory=list)
    description: str = ""
    subject: str = ""
    cover_url: str | None = None

    @model_validator(mode="before")
    @classmethod
    def _from_orm(cls, data: Any) -> Any:
        if isinstance(data, Book):
            ex = data.extras or {}
            return {
                "id": data.id,
                "user_id": data.user_id,
                "title": data.title,
                "author": data.author,
                "s3_key": data.s3_key,
                "s3_url": data.s3_url,
                "file_size_bytes": data.file_size_bytes,
                "status": data.status,
                "created_at": data.created_at,
                "extras": ex,
                "file_url": data.s3_url,
                "table_of_contents": ex.get("table_of_contents") or [],
                "tags": ex.get("tags") or [],
                "description": ex.get("description") or "",
                "subject": ex.get("subject") or "",
                "cover_url": ex.get("cover_url"),
            }
        return data


class BookListPage(BaseModel):
    """Paginated books list: same envelope as quiz-results and leaderboard (items, page, size, total, has_more)."""

    items: list[BookOut]
    page: int = Field(..., ge=1)
    size: int = Field(..., ge=1)
    total: int = Field(..., ge=0)
    has_more: bool
    total_pages: int = Field(..., ge=0, description="ceil(total / size); 0 when total is 0")
