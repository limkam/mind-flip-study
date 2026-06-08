from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import get_current_user
from models.book import Book
from models.enums import WorkbookStatus
from models.flashcard import Workbook
from models.user import User
from schemas.flashcards_api import GenerateWorkbookRequest, WorkbookOut, WorkbookPatch
from schemas.job import JobEnqueueResponse
from tasks.ai_tasks import generate_workbook_task

router = APIRouter(tags=["workbooks"])


async def _workbook_out(db: AsyncSession, wb: Workbook) -> WorkbookOut:
    bt = None
    if wb.book_id:
        r = await db.execute(select(Book.title).where(Book.id == wb.book_id))
        bt = r.scalar_one_or_none()
    chapters = (wb.content or {}).get("chapters") or []
    return WorkbookOut(
        id=wb.id,
        user_id=wb.user_id,
        book_id=wb.book_id,
        title=wb.title,
        content=wb.content or {},
        status=wb.status,
        created_at=wb.created_at,
        book_title=bt,
        chapters=list(chapters),
    )


@router.post("/generate", response_model=JobEnqueueResponse, status_code=status.HTTP_202_ACCEPTED)
async def enqueue_workbook(
    body: GenerateWorkbookRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> JobEnqueueResponse:
    br = await db.execute(
        select(Book).where(Book.id == body.book_id, Book.user_id == current_user.id),
    )
    if br.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Book not found")
    task = generate_workbook_task.delay(
        str(body.book_id),
        str(current_user.id),
        body.title,
        body.chapter_hint,
        selected_chapters=body.selected_chapters,
    )
    return JobEnqueueResponse(job_id=task.id)


@router.get("/", response_model=list[WorkbookOut])
async def list_workbooks(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    book_id: UUID | None = Query(None),
) -> list[WorkbookOut]:
    q = select(Workbook).where(Workbook.user_id == current_user.id)
    if book_id is not None:
        q = q.where(Workbook.book_id == book_id)
    q = q.order_by(Workbook.created_at.desc())
    r = await db.execute(q)
    rows = list(r.scalars().all())
    out: list[WorkbookOut] = []
    for wb in rows:
        out.append(await _workbook_out(db, wb))
    return out


@router.get("/{workbook_id}", response_model=WorkbookOut)
async def get_workbook(
    workbook_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> WorkbookOut:
    r = await db.execute(
        select(Workbook).where(Workbook.id == workbook_id, Workbook.user_id == current_user.id),
    )
    row = r.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Workbook not found")
    return await _workbook_out(db, row)


@router.patch("/{workbook_id}", response_model=WorkbookOut)
async def patch_workbook(
    workbook_id: UUID,
    body: WorkbookPatch,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> WorkbookOut:
    r = await db.execute(
        select(Workbook).where(Workbook.id == workbook_id, Workbook.user_id == current_user.id),
    )
    row = r.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Workbook not found")
    if body.content is not None:
        row.content = body.content
        row.status = WorkbookStatus.ready
    await db.commit()
    await db.refresh(row)
    return await _workbook_out(db, row)
