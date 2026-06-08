from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import get_current_user
from models.flashcard import Folder
from models.user import User

router = APIRouter(tags=["folders"])


class FolderCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(..., min_length=1, max_length=512)
    parent_id: UUID | None = None
    description: str | None = Field(None, max_length=4000)
    color: str | None = Field(None, max_length=64)
    icon: str | None = Field(None, max_length=16)


class FolderOut(BaseModel):
    """Matches Collections UI (FolderCard, FolderDetailDialog, FolderDialog)."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    name: str
    parent_id: UUID | None
    created_at: datetime
    description: str | None = None
    color: str = "violet"
    icon: str = "📁"
    book_ids: list[UUID] = Field(default_factory=list)
    flashcard_set_ids: list[UUID] = Field(default_factory=list)


class FolderPatch(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str | None = Field(None, min_length=1, max_length=512)
    parent_id: UUID | None = None
    description: str | None = Field(None, max_length=4000)
    color: str | None = Field(None, max_length=64)
    icon: str | None = Field(None, max_length=16)
    book_ids: list[UUID] | None = None
    flashcard_set_ids: list[UUID] | None = None


def _as_uuid_list(raw: Any) -> list[UUID]:
    if not isinstance(raw, list):
        return []
    out: list[UUID] = []
    for x in raw:
        if x is None:
            continue
        out.append(x if isinstance(x, UUID) else UUID(str(x)))
    return out


def _folder_out(row: Folder) -> FolderOut:
    return FolderOut(
        id=row.id,
        user_id=row.user_id,
        name=row.name,
        parent_id=row.parent_id,
        created_at=row.created_at,
        description=row.description,
        color=row.color or "violet",
        icon=row.icon or "📁",
        book_ids=_as_uuid_list(row.book_ids),
        flashcard_set_ids=_as_uuid_list(row.flashcard_set_ids),
    )


@router.get("/", response_model=list[FolderOut])
async def list_folders(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[FolderOut]:
    r = await db.execute(
        select(Folder).where(Folder.user_id == current_user.id).order_by(Folder.created_at.desc()),
    )
    return [_folder_out(f) for f in r.scalars().all()]


@router.post("/", response_model=FolderOut, status_code=status.HTTP_201_CREATED)
async def create_folder(
    body: FolderCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FolderOut:
    f = Folder(
        user_id=current_user.id,
        name=body.name,
        parent_id=body.parent_id,
        description=body.description,
        color=body.color or "violet",
        icon=body.icon or "📁",
    )
    db.add(f)
    await db.commit()
    await db.refresh(f)
    return _folder_out(f)


@router.patch("/{folder_id}", response_model=FolderOut)
async def patch_folder(
    folder_id: UUID,
    body: FolderPatch,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FolderOut:
    r = await db.execute(select(Folder).where(Folder.id == folder_id, Folder.user_id == current_user.id))
    row = r.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Folder not found")
    if body.name is not None:
        row.name = body.name
    if body.parent_id is not None:
        row.parent_id = body.parent_id
    if body.description is not None:
        row.description = body.description
    if body.color is not None:
        row.color = body.color
    if body.icon is not None:
        row.icon = body.icon
    if body.book_ids is not None:
        row.book_ids = [str(x) for x in body.book_ids]
    if body.flashcard_set_ids is not None:
        row.flashcard_set_ids = [str(x) for x in body.flashcard_set_ids]
    await db.commit()
    await db.refresh(row)
    return _folder_out(row)


@router.delete("/{folder_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_folder(
    folder_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    r = await db.execute(select(Folder).where(Folder.id == folder_id, Folder.user_id == current_user.id))
    row = r.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Folder not found")
    await db.execute(delete(Folder).where(Folder.id == folder_id))
    await db.commit()
