"""Study groups API — create, join, search, detail."""

from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import get_current_user
from models.book import Book
from models.flashcard import FlashcardSet
from models.quiz import StudyEvent
from models.study_group import StudyGroup, StudyGroupContentActivation, StudyGroupMaterial, StudyGroupMember
from models.user import User
from user_identity import resolve_display_name
from services.entitlements import Action, can_user_do, _plan_features, _user_plan_slug
from services.usage_events import BOOK_UPLOADED, FLASHCARDS_GENERATED, consumed_quantity, current_period_start, record_usage

router = APIRouter(tags=["study-groups"])


class StudyGroupCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=128)
    description: str | None = Field(None, max_length=2000)
    privacy: str = Field("public", pattern="^(public|private)$")
    weekly_card_goal: int = Field(20, ge=1, le=500)
    book_id: UUID | None = None
    book_ids: list[UUID] = Field(default_factory=list)


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


def _group_scoped_sets(group_id: UUID):
    """Subquery of (user_id, set_id) pairs whose reviews count toward this group's progress:
    a member's own material they added to the group, or content they've activated from it.
    Reviews of a member's content that was never added to or activated from this specific
    group must never count toward it, even though the member studied it elsewhere in the app."""
    own = (
        select(StudyGroupMaterial.added_by.label("user_id"), FlashcardSet.id.label("set_id"))
        .join(
            FlashcardSet,
            and_(
                FlashcardSet.book_id == StudyGroupMaterial.book_id,
                FlashcardSet.user_id == StudyGroupMaterial.added_by,
            ),
        )
        .where(StudyGroupMaterial.group_id == group_id)
    )
    activated = (
        select(
            StudyGroupContentActivation.user_id.label("user_id"),
            StudyGroupContentActivation.set_id.label("set_id"),
        )
        .join(StudyGroupMaterial, StudyGroupMaterial.id == StudyGroupContentActivation.material_id)
        .where(
            StudyGroupMaterial.group_id == group_id,
            StudyGroupContentActivation.deactivated_at.is_(None),
        )
    )
    return own.union(activated).subquery()


def _group_review_events_stmt(group_id: UUID, *, user_ids: list[UUID] | None = None, since: datetime | None = None):
    scoped = _group_scoped_sets(group_id)
    stmt = (
        select(StudyEvent)
        .join(scoped, and_(scoped.c.user_id == StudyEvent.user_id, scoped.c.set_id == StudyEvent.set_id))
        .where(StudyEvent.event_type == "review")
    )
    if user_ids is not None:
        stmt = stmt.where(StudyEvent.user_id.in_(user_ids))
    if since is not None:
        stmt = stmt.where(StudyEvent.created_at >= since)
    return stmt


async def _cards_this_week(db: AsyncSession, group_id: UUID, user_ids: list[UUID]) -> int:
    if not user_ids:
        return 0
    stmt = select(func.count()).select_from(
        _group_review_events_stmt(group_id, user_ids=user_ids, since=_week_start()).subquery(),
    )
    r = await db.execute(stmt)
    return int(r.scalar() or 0)


async def _member_cards_this_week(db: AsyncSession, group_id: UUID, user_id: UUID) -> int:
    return await _cards_this_week(db, group_id, [user_id])


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
    cards_week = await _cards_this_week(db, group.id, member_ids) if is_member else 0
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


async def _serialize_material(db: AsyncSession, mat: StudyGroupMaterial, *, viewer_id: UUID | None = None) -> dict[str, Any]:
    book = await db.get(Book, mat.book_id)
    adder = await db.get(User, mat.added_by)
    is_own = viewer_id is not None and mat.added_by == viewer_id
    activated = False
    if viewer_id is not None and not is_own:
        activation = await db.scalar(
            select(StudyGroupContentActivation).where(
                StudyGroupContentActivation.user_id == viewer_id,
                StudyGroupContentActivation.material_id == mat.id,
                StudyGroupContentActivation.deactivated_at.is_(None),
            ),
        )
        activated = activation is not None
    return {
        "id": str(mat.id),
        "book_id": str(mat.book_id),
        "title": book.title if book else "Unknown book",
        "author": book.author if book else "",
        "added_by_name": resolve_display_name(full_name=adder.full_name if adder else None, email=adder.email if adder else None),
        "added_at": mat.added_at.isoformat() if mat.added_at else None,
        "is_own": is_own,
        "activated": is_own or activated,
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
        cards = await _member_cards_this_week(db, group_id, user.id)
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
    materials = [await _serialize_material(db, m, viewer_id=current_user.id) for m in mats_r.scalars().all()]

    member_ids = [UUID(m["user_id"]) for m in members]
    activity_events = _group_review_events_stmt(group_id, user_ids=member_ids).subquery()
    activity_r = await db.execute(
        select(activity_events, User)
        .join(User, User.id == activity_events.c.user_id)
        .order_by(activity_events.c.created_at.desc())
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
        select(func.count()).select_from(_group_review_events_stmt(group_id, user_ids=member_ids).subquery()),
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
    decision = await can_user_do(db, current_user, Action.CREATE_STUDY_GROUP)
    if not decision.get("allowed"):
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail={"code": "UPGRADE_REQUIRED", "message": "Upgrade to Standard 15 or Premium 30 to create study groups."},
        )
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

    material_ids: list[UUID] = list(body.book_ids)
    if body.book_id and body.book_id not in material_ids:
        material_ids.append(body.book_id)
    for book_id in material_ids:
        await _verify_owned_book(db, book_id, current_user.id)
        db.add(
            StudyGroupMaterial(
                group_id=group.id,
                book_id=book_id,
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
    return await _serialize_material(db, mat, viewer_id=current_user.id)


async def _resolve_material_set(db: AsyncSession, mat: StudyGroupMaterial) -> FlashcardSet | None:
    set_r = await db.execute(
        select(FlashcardSet)
        .where(FlashcardSet.book_id == mat.book_id, FlashcardSet.user_id == mat.added_by)
        .order_by(FlashcardSet.created_at.desc())
        .limit(1),
    )
    return set_r.scalar_one_or_none()


async def _remaining_slots(db: AsyncSession, user: User) -> dict[str, int | None]:
    """Slots left against the permanent ledger charge — matches Action.ACTIVATE_SHARED_CONTENT
    exactly. A prior activation, active or deactivated, already spent its slot permanently, so
    it must not be subtracted again here."""
    plan_slug = await _user_plan_slug(db, user)
    features = await _plan_features(db, plan_slug)
    period_start = current_period_start(lifetime=plan_slug == "free")
    max_books = features.get("max_books")
    max_sets = features.get("max_sets")
    books_remaining = None
    sets_remaining = None
    if max_books is not None:
        owned_books = await consumed_quantity(db, user.id, BOOK_UPLOADED, period_start=period_start)
        books_remaining = max(0, int(max_books) - int(owned_books or 0))
    if max_sets is not None:
        owned_sets = await consumed_quantity(db, user.id, FLASHCARDS_GENERATED, period_start=period_start)
        sets_remaining = max(0, int(max_sets) - int(owned_sets or 0))
    return {"book_slots_remaining": books_remaining, "set_slots_remaining": sets_remaining}


@router.get("/{group_id}/materials/{material_id}/activation", response_model=dict[str, Any])
async def get_material_activation_preview(
    group_id: UUID,
    material_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    """Lets the frontend show "this will use 1 of your X remaining book slots" before a first
    activation, or "reactivating is free" when `previously_charged` is true."""
    await _require_member(db, group_id, current_user)
    mat = await db.get(StudyGroupMaterial, material_id)
    if mat is None or mat.group_id != group_id:
        raise HTTPException(status_code=404, detail="Material not found in this group")

    book = await db.get(Book, mat.book_id)
    book_title = book.title if book else "Unknown book"

    if mat.added_by == current_user.id:
        # The sharer already owns this content — it already counts against their quota
        # from the original upload, no separate activation needed.
        fset = await _resolve_material_set(db, mat)
        return {
            "material_id": str(material_id),
            "set_id": str(fset.id) if fset else None,
            "book_title": book_title,
            "already_activated": True,
            "is_own": True,
        }

    existing = await db.scalar(
        select(StudyGroupContentActivation).where(
            StudyGroupContentActivation.user_id == current_user.id,
            StudyGroupContentActivation.material_id == material_id,
        ),
    )
    active = existing is not None and existing.deactivated_at is None
    # A deactivated row means this material was already charged once and reactivating it is
    # free — mirrors the `already_charged` skip in activate_shared_material.
    previously_charged = existing is not None and not active
    slots = await _remaining_slots(db, current_user)
    return {
        "material_id": str(material_id),
        "set_id": str(existing.set_id) if existing is not None else None,
        "book_title": book_title,
        "already_activated": active,
        "previously_charged": previously_charged,
        "is_own": False,
        **slots,
    }


@router.post("/{group_id}/materials/{material_id}/activate", response_model=dict[str, Any])
async def activate_shared_material(
    group_id: UUID,
    material_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    """Spend the member's own book+set quota slots to gain full, normal study access to a
    material shared in this group — same cost and same access as if they'd uploaded/generated
    it themselves (see Action.ACTIVATE_SHARED_CONTENT). The charge is a one-time, permanent
    ledger charge per (user, material): deactivating and reactivating the same material later
    restores access for free — it never charges a second slot."""
    await _require_member(db, group_id, current_user)

    mat = await db.get(StudyGroupMaterial, material_id)
    if mat is None or mat.group_id != group_id:
        raise HTTPException(status_code=404, detail="Material not found in this group")

    if mat.added_by == current_user.id:
        fset = await _resolve_material_set(db, mat)
        return {"material_id": str(material_id), "set_id": str(fset.id) if fset else None, "activated": True}

    existing = await db.scalar(
        select(StudyGroupContentActivation).where(
            StudyGroupContentActivation.user_id == current_user.id,
            StudyGroupContentActivation.material_id == material_id,
        ),
    )
    if existing is not None and existing.deactivated_at is None:
        return {"material_id": str(material_id), "set_id": str(existing.set_id), "activated": True}

    book = await db.get(Book, mat.book_id)
    if book is None:
        raise HTTPException(status_code=404, detail="Book not found")

    fset = await _resolve_material_set(db, mat)
    if fset is None:
        raise HTTPException(status_code=404, detail="No flashcards available for this material yet")

    # A prior (now-deactivated) row means this material was already charged once, permanently.
    # Reactivating it is a visibility toggle, not a new purchase — skip the quota gate and the
    # ledger charge entirely so it can never be blocked or billed twice for the same material.
    already_charged = existing is not None
    if not already_charged:
        decision = await can_user_do(db, current_user, Action.ACTIVATE_SHARED_CONTENT)
        if not decision.get("allowed"):
            slots = await _remaining_slots(db, current_user)
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail={
                    "code": "UPGRADE_REQUIRED",
                    "reason": decision.get("reason"),
                    "message": "You're out of book/set slots on your current plan. Upgrade to add this to your library.",
                    **slots,
                },
            )

    if existing is not None:
        existing.deactivated_at = None
    else:
        db.add(
            StudyGroupContentActivation(
                user_id=current_user.id,
                material_id=material_id,
                book_id=mat.book_id,
                set_id=fset.id,
            ),
        )

    if not already_charged:
        lifetime = (await _user_plan_slug(db, current_user)) == "free"
        await record_usage(
            db,
            user_id=current_user.id,
            event_type=BOOK_UPLOADED,
            resource_type="study_group_material",
            resource_id=mat.book_id,
            period_start=current_period_start(lifetime=lifetime),
            idempotency_key=f"activate:{current_user.id}:{material_id}:book",
        )
        await record_usage(
            db,
            user_id=current_user.id,
            event_type=FLASHCARDS_GENERATED,
            resource_type="study_group_material",
            resource_id=fset.id,
            period_start=current_period_start(lifetime=lifetime),
            idempotency_key=f"activate:{current_user.id}:{material_id}:set",
        )
    await db.commit()
    return {"material_id": str(material_id), "set_id": str(fset.id), "activated": True}


@router.post("/{group_id}/materials/{material_id}/deactivate", response_model=dict[str, Any])
async def deactivate_shared_material(
    group_id: UUID,
    material_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    """Hide a previously-activated material from the active study list. This does NOT refund
    the quota slot it used — the charge is permanent, same as deleting an owned book/set never
    refunds it. Spaced-repetition progress is not deleted and reactivating (free, no new charge)
    makes it reachable again immediately."""
    await _require_member(db, group_id, current_user)
    activation = await db.scalar(
        select(StudyGroupContentActivation).where(
            StudyGroupContentActivation.user_id == current_user.id,
            StudyGroupContentActivation.material_id == material_id,
            StudyGroupContentActivation.deactivated_at.is_(None),
        ),
    )
    if activation is not None:
        activation.deactivated_at = datetime.now(timezone.utc)
        await db.commit()
    return {"material_id": str(material_id), "activated": False}


@router.post("/{group_id}/leave", status_code=status.HTTP_204_NO_CONTENT)
async def leave_group(
    group_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    """Leaving a group hides anything the member activated from it from their active study
    list — it does NOT refund the quota those activations used, same as deactivating. Their
    spaced-repetition progress on that content is preserved, not deleted.

    The owner cannot leave while other members remain — there is no ownership-transfer or
    member-removal endpoint yet, so an owner leaving would strand the group with no one able
    to manage it. If the owner is the group's only member, leaving deletes the group instead
    of leaving a permanent, ownerless, zero-member group sitting in public search."""
    membership = await db.scalar(
        select(StudyGroupMember).where(
            StudyGroupMember.group_id == group_id,
            StudyGroupMember.user_id == current_user.id,
        ),
    )
    if membership is None:
        raise HTTPException(status_code=404, detail="You are not a member of this group")

    if membership.role == "owner":
        other_members = await db.scalar(
            select(func.count()).select_from(StudyGroupMember).where(
                StudyGroupMember.group_id == group_id,
                StudyGroupMember.user_id != current_user.id,
            ),
        )
        if other_members:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You're the owner and other members are still in this group — remove them first if you want to leave. Leaving as the sole remaining member deletes the group.",
            )

    group_material_ids = select(StudyGroupMaterial.id).where(StudyGroupMaterial.group_id == group_id)
    active_r = await db.execute(
        select(StudyGroupContentActivation).where(
            StudyGroupContentActivation.user_id == current_user.id,
            StudyGroupContentActivation.material_id.in_(group_material_ids),
            StudyGroupContentActivation.deactivated_at.is_(None),
        ),
    )
    now = datetime.now(timezone.utc)
    for activation in active_r.scalars().all():
        activation.deactivated_at = now

    if membership.role == "owner":
        # Sole owner leaving: nothing and no one is left to orphan — remove the group itself.
        group = await db.get(StudyGroup, group_id)
        if group is not None:
            await db.delete(group)
        await db.commit()
        return

    await db.delete(membership)
    await db.commit()
