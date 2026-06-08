import json
from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from models.enums import WorkbookStatus


class FlashcardOut(BaseModel):
    """Card row; ``chapter`` / ``difficulty`` reserved for future AI metadata."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    set_id: UUID
    front: str
    back: str
    created_at: datetime
    chapter: str | None = None
    difficulty: str | None = None


def flashcard_set_meta_from_description(description: str | None) -> dict[str, Any]:
    if not description or not description.strip().startswith("{"):
        return {}
    try:
        return json.loads(description)
    except json.JSONDecodeError:
        return {}


class FlashcardSetOut(BaseModel):
    """Aligned with Dashboard / Flashcard Sets (``card_count``, ``book_title``, etc.)."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    book_id: UUID | None
    title: str
    description: str | None
    tags: list[Any] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime
    book_title: str | None = None
    cards: list[FlashcardOut] = Field(default_factory=list)
    card_count: int = 0
    selected_chapters: list[Any] = Field(default_factory=list)


class FlashcardSetUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=512)
    description: str | None = None
    tags: list[str] | None = None


class FlashcardSetCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=512)
    book_id: UUID | None = None
    description: str | None = None
    tags: list[str] | None = None


class GenerateFlashcardsRequest(BaseModel):
    book_id: UUID
    title: str = Field(..., min_length=1, max_length=512)
    num_cards: int = Field(..., ge=1, le=200)
    selected_chapters: list[str] | None = None


class GenerateWorkbookRequest(BaseModel):
    book_id: UUID
    title: str = Field(..., min_length=1, max_length=512)
    chapter_hint: str | None = Field(None, max_length=4000)
    selected_chapters: list[str] | None = None


class WorkbookOut(BaseModel):
    """Includes ``chapters`` and ``book_title`` for WorkbookView.jsx."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    book_id: UUID
    title: str
    content: dict[str, Any]
    status: WorkbookStatus
    created_at: datetime
    book_title: str | None = None
    chapters: list[Any] = Field(default_factory=list)


class WorkbookPatch(BaseModel):
    content: dict[str, Any] | None = None


class AiInvokeRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=200_000)
    response_json_schema: dict[str, Any] | None = None
