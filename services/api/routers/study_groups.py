"""Study groups API — create, join, search, detail."""

from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import get_current_user
from models.book import Book
from models.quiz import StudyEvent
from models.study_group import StudyGroup, StudyGroupMaterial, StudyGroupMember
from models.user import User
from user_identity import resolve_display_name

router = APIRouter(tags=["study-groups"])


class StudyGroupCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=128)
    description: str | None = Field(None, max_length=2000)
    privacy: str = Field("public", pattern="^(public|private)$")
    weekly_card_goal: int = Field(20, ge=1, le=500)
    book_id: UUID | None = None


class StudyGroupJoin(BaseModel):
    code: str = Field(..., min_length=4, max_length=12)


class StudyGroupMaterialIn(BaseModel):
    book_id: UUID


def _new_group_code() -> str:
    return secrets.token_urlsafe(6).replace("-", "").replace("_", "")[:8].upper()


def _week_start() -> datetime:
    now = datetime.now(timezone.utc)
    start = now - timedelta(days=now.weekday())
    return start.replace(hour=0, minute=0, second=0, microsecond=0)


async def _member_count(db: AsyncSession, group_id: UUID) -> int:
    r = await db.execute(
        select(func.count()).select_from(StudyGroupMember).where(StudyGroupMember.group_id == group_id),
    )
    return int(r.scalar() or 0)


async def _is_member(db: AsyncSession, group_id: UUID, user_id: UUID) -> bool:
    r = await db.execute(
        select(StudyGroupMember.id).where(
            StudyGroupMember.group_id == group_id,
            StudyGroupMember.user_id == user_id,
        ),
    )
    return r.scalar_one_or_none() is not None


async def _require_member(db: AsyncSession, group_id: UUID, user: User) -> StudyGroup:
    r = await db.execute(select(StudyGroup).where(StudyGroup.id == group_id))
    group = r.scalar_one_or_none()
    if group is None:
        raise HTTPException(status_code=404, detail="Group not found")
    if not await _is_member(db, group_id, user.id):
        raise HTTPException(status_code=403, detail="You are not a member of this group")
    return group


async def _verify_owned_book(db: AsyncSession, book_id: UUID, user_id: UUID) -> Book:
    r = await db.execute(select(Book).where(Book.id == book_id, Book.user_id == user_id))
    book = r.scalar_one_or_none()
    if book is None:
        raise HTTPException(status_code=404, detail="Book not found in your library")
    return book


async def _cards_this_week(db: AsyncSession, user_ids: list[UUID]) -> int:
    if not user_ids:
        return 0
    r = await db.execute(
        select(func.count())
        .select_from(StudyEvent)
        .where(
            StudyEvent.user_id.in_(user_ids),
            StudyEvent.event_type == "review",
            StudyEvent.created_at >= _week_start(),
        ),
    )
    return int(r.scalar() or 0)


async def _member_cards_this_week(db: AsyncSession, user_id: UUID) -> int:
    return await _cards_this_week(db, [user_id])


async def _serialize_group(
    db: AsyncSession,
    group: StudyGroup,
    *,
    is_member: bool = False,
) -> dict[str, Any]:
    count = await _member_count(db, group.id)
    member_ids_r = await db.execute(
        select(StudyGroupMember.user_id).where(StudyGroupMember.group_id == group.id),
    )
    member_ids = [row[0] for row in member_ids_r.all()]
    cards_week = await _cards_this_week(db, member_ids) if is_member else 0
    goal = group.weekly_card_goal or 20
    progress_pct = min(100, round((cards_week / max(goal, 1)) * 100, 1)) if is_member else 0

    return {
        "id": str(group.id),
        "name": group.name,
        "description": group.description,
        "code": group.code if is_member else None,
        "privacy": group.privacy,
        "weekly_card_goal": goal,
        "member_count": count,
        "cards_this_week": cards_week,
        "progress_pct": progress_pct,
        "activity_status": "active" if cards_week > 0 else ("quiet" if count > 0 else "new"),
        "created_at": group.created_at.isoformat() if group.created_at else None,
        "is_member": is_member,
    }


async def _serialize_material(db: AsyncSession, mat: StudyGroupMaterial) -> dict[str, Any]:
    book = await db.get(Book, mat.book_id)
    adder = await db.get(User, mat.added_by)
    return {
        "id": str(mat.id),
        "book_id": str(mat.book_id),
        "title": book.title if book else "Unknown book",
        "author": book.author if book else "",
        "added_by_name": resolve_display_name(full_name=adder.full_name if adder else None, email=adder.email if adder else None),
        "added_at": mat.added_at.isoformat() if mat.added_at else None,
    }


@router.get("/mine", response_model=list[dict[str, Any]])
async def list_my_groups(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[dict[str, Any]]:
    r = await db.execute(
        select(StudyGroup)
        .join(StudyGroupMember, StudyGroupMember.group_id == StudyGroup.id)
        .where(StudyGroupMember.user_id == current_user.id)
        .order_by(StudyGroup.name.asc()),
    )
    groups = r.scalars().all()
    return [await _serialize_group(db, g, is_member=True) for g in groups]


@router.get("/search", response_model=list[dict[str, Any]])
async def search_groups(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    q: str = Query("", max_length=128),
) -> list[dict[str, Any]]:
    needle = q.strip()
    stmt = select(StudyGroup).where(StudyGroup.privacy == "public")
    if needle:
        pattern = f"%{needle}%"
        stmt = stmt.where(
            or_(StudyGroup.name.ilike(pattern), StudyGroup.description.ilike(pattern)),
        )
    stmt = stmt.order_by(StudyGroup.name.asc()).limit(30)
    r = await db.execute(stmt)
    groups = r.scalars().all()

    member_r = await db.execute(
        select(StudyGroupMember.group_id).where(StudyGroupMember.user_id == current_user.id),
    )
    joined = {row[0] for row in member_r.all()}

    out: list[dict[str, Any]] = []
    for g in groups:
        item = await _serialize_group(db, g, is_member=g.id in joined)
        out.append(item)
    return out


@router.get("/{group_id}", response_model=dict[str, Any])
async def get_group_detail(
    group_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    group = await _require_member(db, group_id, current_user)
    base = await _serialize_group(db, group, is_member=True)

    members_r = await db.execute(
        select(StudyGroupMember, User)
        .join(User, User.id == StudyGroupMember.user_id)
        .where(StudyGroupMember.group_id == group_id)
        .order_by(StudyGroupMember.joined_at.asc()),
    )
    members = []
    for mem, user in members_r.all():
        cards = await _member_cards_this_week(db, user.id)
        members.append(
            {
                "user_id": str(user.id),
                "full_name": resolve_display_name(full_name=user.full_name, email=user.email),
                "role": mem.role,
                "cards_this_week": cards,
                "joined_at": mem.joined_at.isoformat() if mem.joined_at else None,
            },
        )

    mats_r = await db.execute(
        select(StudyGroupMaterial)
        .where(StudyGroupMaterial.group_id == group_id)
        .order_by(StudyGroupMaterial.added_at.desc()),
    )
    materials = [await _serialize_material(db, m) for m in mats_r.scalars().all()]

    activity_r = await db.execute(
        select(StudyEvent, User)
        .join(User, User.id == StudyEvent.user_id)
        .where(
            StudyEvent.user_id.in_([UUID(m["user_id"]) for m in members]),
            StudyEvent.event_type == "review",
        )
        .order_by(StudyEvent.created_at.desc())
        .limit(25),
    )
    activity = []
    for ev, user in activity_r.all():
        activity.append(
            {
                "id": str(ev.id),
                "user_name": resolve_display_name(full_name=user.full_name, email=user.email),
                "event_type": ev.event_type,
                "created_at": ev.created_at.isoformat() if ev.created_at else None,
            },
        )

    total_activities_r = await db.execute(
        select(func.count())
        .select_from(StudyEvent)
        .where(
            StudyEvent.user_id.in_([UUID(m["user_id"]) for m in members]),
            StudyEvent.event_type == "review",
        ),
    )
    total_activities = int(total_activities_r.scalar() or 0)

    return {
        **base,
        "members": members,
        "materials": materials,
        "activity": activity,
        "total_activities": total_activities,
    }


@router.post("/", response_model=dict[str, Any], status_code=status.HTTP_201_CREATED)
async def create_group(
    body: StudyGroupCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    code = _new_group_code()
    for _ in range(5):
        exists = await db.execute(select(StudyGroup.id).where(StudyGroup.code == code))
        if exists.scalar_one_or_none() is None:
            break
        code = _new_group_code()

    group = StudyGroup(
        name=body.name.strip(),
        description=(body.description or "").strip() or None,
        code=code,
        privacy=body.privacy,
        weekly_card_goal=body.weekly_card_goal,
        created_by=current_user.id,
    )
    db.add(group)
    await db.flush()
    db.add(StudyGroupMember(group_id=group.id, user_id=current_user.id, role="owner"))

    if body.book_id:
        await _verify_owned_book(db, body.book_id, current_user.id)
        db.add(
            StudyGroupMaterial(
                group_id=group.id,
                book_id=body.book_id,
                added_by=current_user.id,
            ),
        )

    await db.commit()
    await db.refresh(group)
    return await _serialize_group(db, group, is_member=True)


@router.post("/join", response_model=dict[str, Any])
async def join_group(
    body: StudyGroupJoin,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    code = body.code.strip().upper()
    r = await db.execute(select(StudyGroup).where(StudyGroup.code == code))
    group = r.scalar_one_or_none()
    if group is None:
        raise HTTPException(status_code=404, detail="Group not found. Check the code and try again.")

    existing = await db.execute(
        select(StudyGroupMember).where(
            StudyGroupMember.group_id == group.id,
            StudyGroupMember.user_id == current_user.id,
        ),
    )
    if existing.scalar_one_or_none() is not None:
        return await _serialize_group(db, group, is_member=True)

    db.add(StudyGroupMember(group_id=group.id, user_id=current_user.id, role="member"))
    await db.commit()
    return await _serialize_group(db, group, is_member=True)


@router.post("/{group_id}/materials", response_model=dict[str, Any], status_code=status.HTTP_201_CREATED)
async def add_group_material(
    group_id: UUID,
    body: StudyGroupMaterialIn,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    await _require_member(db, group_id, current_user)
    await _verify_owned_book(db, body.book_id, current_user.id)

    dup = await db.execute(
        select(StudyGroupMaterial).where(
            StudyGroupMaterial.group_id == group_id,
            StudyGroupMaterial.book_id == body.book_id,
        ),
    )
    if dup.scalar_one_or_none() is not None:
        raise HTTPException(status_code=400, detail="This book is already in the group")

    mat = StudyGroupMaterial(
        group_id=group_id,
        book_id=body.book_id,
        added_by=current_user.id,
    )
    db.add(mat)
    await db.commit()
    await db.refresh(mat)
    return await _serialize_material(db, mat)
