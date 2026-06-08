from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from age_utils import validate_date_of_birth
from database import get_db
from dependencies import get_current_user, require_role
from models.user import User
from passwords import hash_password
from schemas.push import PushTokenBody, PushTokenResponse
from schemas.user import AdminCreateUserRequest, AdminPatchUserRole, UserPublic, UserSearchHit, UserSelfPatch

router = APIRouter(tags=["users"])


@router.get("/me", response_model=UserPublic)
async def read_current_user(current_user: Annotated[User, Depends(get_current_user)]) -> User:
    return current_user


@router.post("/me/push-token", response_model=PushTokenResponse)
async def register_push_token(
    body: PushTokenBody,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PushTokenResponse:
    current_user.push_token = body.token.strip()
    current_user.push_platform = body.platform
    await db.commit()
    return PushTokenResponse(registered=True)


@router.patch("/me", response_model=UserPublic)
async def patch_current_user(
    body: UserSelfPatch,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    if body.full_name is not None:
        current_user.full_name = body.full_name
    if body.date_of_birth is not None:
        try:
            current_user.date_of_birth = validate_date_of_birth(body.date_of_birth)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    if body.occupation is not None:
        current_user.occupation = body.occupation
    if body.job_title is not None:
        current_user.job_title = body.job_title
    if body.preferences is not None:
        merged = dict(current_user.preferences or {})
        merged.update(body.preferences)
        current_user.preferences = merged
    await db.commit()
    await db.refresh(current_user)
    return current_user


@router.get("/search", response_model=list[UserSearchHit])
async def search_users_by_name(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    q: str = Query("", max_length=200, description="Substring match on full_name (case-insensitive)"),
) -> list[UserSearchHit]:
    term = (q or "").strip()
    if not term:
        return []
    like = f"%{term.replace('%', r'\%').replace('_', r'\_')}%"
    r = await db.execute(
        select(User.full_name)
        .where(
            User.id != current_user.id,
            User.full_name.ilike(like, escape="\\"),
        )
        .order_by(User.full_name.asc())
        .limit(10),
    )
    return [UserSearchHit(full_name=row[0]) for row in r.all()]


@router.get("/", response_model=list[UserPublic])
async def list_users_admin(
    _admin: Annotated[User, Depends(require_role("admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[UserPublic]:
    r = await db.execute(select(User).order_by(User.created_at.desc()))
    return [UserPublic.model_validate(u) for u in r.scalars().all()]


@router.post("/", response_model=UserPublic, status_code=status.HTTP_201_CREATED)
async def admin_create_user(
    body: AdminCreateUserRequest,
    _admin: Annotated[User, Depends(require_role("admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> UserPublic:
    user = User(
        email=str(body.email).lower(),
        hashed_password=hash_password(body.password),
        role=body.role,
        full_name=body.full_name,
        preferences={},
    )
    db.add(user)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=400, detail="Email already registered") from None
    await db.refresh(user)
    return UserPublic.model_validate(user)


@router.patch("/{user_id}", response_model=UserPublic)
async def admin_patch_user(
    user_id: UUID,
    body: AdminPatchUserRole,
    _admin: Annotated[User, Depends(require_role("admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> UserPublic:
    r = await db.execute(select(User).where(User.id == user_id))
    user = r.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    user.role = body.role
    await db.commit()
    await db.refresh(user)
    return UserPublic.model_validate(user)
