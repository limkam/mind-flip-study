"""Persisted scorecards and privacy-safe public sharing."""

from datetime import UTC, date, datetime, timedelta
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from database import get_db
from dependencies import enforce_scorecard_share_rate_limit, get_current_user
from models.engagement import Scorecard, ScorecardShare
from models.user import User
from services.scorecard_sharing import (
    generate_token,
    load_valid_share,
    public_view,
    render_html,
    render_svg,
    security_headers,
    token_hash,
)
from services.scorecards import refresh_current_scorecards

router = APIRouter(tags=["scorecards"])
public_router = APIRouter(tags=["public-scorecards"])


class ScorecardOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    period_type: str
    entity_id: str
    period_start: date
    period_end: date
    score: int
    formula_version: str
    metrics: dict


class ShareCreate(BaseModel):
    expires_in_days: int | None = Field(default=None, ge=1)
    show_display_name: bool = False
    public_display_name: str | None = Field(default=None, max_length=80)
    public_message: str | None = Field(default=None, max_length=240)

    @field_validator("public_display_name", "public_message")
    @classmethod
    def clean_public_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = " ".join(value.split()).strip()
        if any(ord(char) < 32 for char in value):
            raise ValueError("control characters are not allowed")
        return value or None

    @model_validator(mode="after")
    def require_explicit_name(self) -> "ShareCreate":
        if self.show_display_name and not self.public_display_name:
            raise ValueError("a public display name is required when name sharing is enabled")
        if not self.show_display_name:
            self.public_display_name = None
        return self


class ShareOut(BaseModel):
    id: UUID
    share_url: str
    expires_at: datetime
    show_display_name: bool


class ShareSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    created_at: datetime
    expires_at: datetime
    revoked_at: datetime | None
    show_display_name: bool


def _require_scorecards() -> None:
    if not settings.ENGAGEMENT_SCORECARDS_ENABLED:
        raise HTTPException(status_code=404, detail="Scorecard not found")


def _require_sharing() -> None:
    if not settings.ENGAGEMENT_SCORECARDS_ENABLED or not settings.SCORECARD_SHARE_ENABLED:
        raise HTTPException(status_code=404, detail="Scorecard not found")


async def _owned(db: AsyncSession, user_id: UUID, scorecard_id: UUID) -> Scorecard:
    row = await db.scalar(select(Scorecard).where(Scorecard.id == scorecard_id, Scorecard.user_id == user_id))
    if row is None:
        raise HTTPException(status_code=404, detail="Scorecard not found")
    return row


@router.get("/", response_model=list[ScorecardOut])
async def list_scorecards(current_user: Annotated[User, Depends(get_current_user)], db: Annotated[AsyncSession, Depends(get_db)]) -> list[ScorecardOut]:
    _require_scorecards()
    rows = (await db.scalars(select(Scorecard).where(Scorecard.user_id == current_user.id).order_by(Scorecard.period_end.desc(), Scorecard.updated_at.desc()).limit(60))).all()
    return [ScorecardOut.model_validate(row) for row in rows]


@router.post("/refresh", response_model=list[ScorecardOut])
async def refresh_scorecards(current_user: Annotated[User, Depends(get_current_user)], db: Annotated[AsyncSession, Depends(get_db)]) -> list[ScorecardOut]:
    _require_scorecards()
    await refresh_current_scorecards(db, current_user.id)
    rows = (await db.scalars(select(Scorecard).where(Scorecard.user_id == current_user.id).order_by(Scorecard.period_end.desc(), Scorecard.updated_at.desc()).limit(60))).all()
    return [ScorecardOut.model_validate(row) for row in rows]


@router.post("/generate", response_model=ScorecardOut)
async def generate_scorecard(current_user: Annotated[User, Depends(get_current_user)], db: Annotated[AsyncSession, Depends(get_db)]) -> ScorecardOut:
    """Legacy API compatibility only; the owner UI never manually generates cards."""
    _require_scorecards()
    rows = await refresh_current_scorecards(db, current_user.id)
    return ScorecardOut.model_validate(next(row for row in rows if row.period_type == "weekly"))


@router.get("/detail/{scorecard_id}", response_model=ScorecardOut)
async def get_scorecard(scorecard_id: UUID, current_user: Annotated[User, Depends(get_current_user)], db: Annotated[AsyncSession, Depends(get_db)]) -> ScorecardOut:
    _require_scorecards()
    return ScorecardOut.model_validate(await _owned(db, current_user.id, scorecard_id))


@router.get("/{scorecard_id}/shares", response_model=list[ShareSummary])
async def list_shares(scorecard_id: UUID, current_user: Annotated[User, Depends(get_current_user)], db: Annotated[AsyncSession, Depends(get_db)]) -> list[ShareSummary]:
    _require_sharing()
    await _owned(db, current_user.id, scorecard_id)
    rows = (await db.scalars(select(ScorecardShare).where(ScorecardShare.scorecard_id == scorecard_id, ScorecardShare.user_id == current_user.id).order_by(ScorecardShare.created_at.desc()).limit(20))).all()
    return [ShareSummary.model_validate(row) for row in rows]


@router.post("/{scorecard_id}/share", response_model=ShareOut, status_code=201)
async def create_share(scorecard_id: UUID, body: ShareCreate, current_user: Annotated[User, Depends(get_current_user)], db: Annotated[AsyncSession, Depends(get_db)]) -> ShareOut:
    _require_sharing()
    card = await _owned(db, current_user.id, scorecard_id)
    if card.period_type not in {"weekly", "monthly", "course"}:
        raise HTTPException(status_code=409, detail="Scorecard is not eligible for sharing")
    days = body.expires_in_days or settings.SCORECARD_SHARE_DEFAULT_EXPIRY_DAYS
    if days > settings.SCORECARD_SHARE_MAX_EXPIRY_DAYS:
        raise HTTPException(status_code=422, detail="Expiration exceeds sharing policy")
    token = generate_token()
    expires_at = datetime.now(UTC) + timedelta(days=days)
    share = ScorecardShare(
        user_id=current_user.id, scorecard_id=card.id, token_hash=token_hash(token),
        token_prefix=token[:8], expires_at=expires_at,
        show_display_name=body.show_display_name,
        public_display_name=body.public_display_name if body.show_display_name else None,
        public_message=body.public_message,
    )
    db.add(share)
    await db.commit()
    await db.refresh(share)
    base = settings.PUBLIC_SHARE_BASE_URL.rstrip("/")
    return ShareOut(id=share.id, share_url=f"{base}/share/scorecard/{token}", expires_at=share.expires_at, show_display_name=share.show_display_name)


@router.delete("/{scorecard_id}/share/{share_id}")
async def revoke_share(scorecard_id: UUID, share_id: UUID, current_user: Annotated[User, Depends(get_current_user)], db: Annotated[AsyncSession, Depends(get_db)]) -> dict[str, bool]:
    _require_sharing()
    await _owned(db, current_user.id, scorecard_id)
    share = await db.scalar(select(ScorecardShare).where(ScorecardShare.id == share_id, ScorecardShare.scorecard_id == scorecard_id, ScorecardShare.user_id == current_user.id))
    if share is None:
        raise HTTPException(status_code=404, detail="Share not found")
    if share.revoked_at is None:
        share.revoked_at = datetime.now(UTC)
        await db.commit()
    return {"revoked": True}


async def _public_or_404(token: str, db: AsyncSession, *, record_access: bool = True):
    if not settings.ENGAGEMENT_SCORECARDS_ENABLED or not settings.SCORECARD_SHARE_ENABLED:
        return None
    return await load_valid_share(db, token, record_access=record_access)


def _public_not_found(*, media_type: str = "text/html") -> Response:
    return Response(
        content="Not found",
        status_code=status.HTTP_404_NOT_FOUND,
        media_type=media_type,
        headers=security_headers(),
    )


@public_router.get("/share/scorecard/{token}", response_class=HTMLResponse, dependencies=[Depends(enforce_scorecard_share_rate_limit())])
async def public_scorecard_page(token: str, db: Annotated[AsyncSession, Depends(get_db)]) -> HTMLResponse:
    loaded = await _public_or_404(token, db)
    if loaded is None:
        return _public_not_found()
    share, card = loaded
    base = settings.PUBLIC_SHARE_BASE_URL.rstrip("/")
    canonical = f"{base}/share/scorecard/{token}"
    content = render_html(public_view(share, card), canonical, f"{canonical}/image", settings.PUBLIC_APP_URL.rstrip("/"))
    return HTMLResponse(content=content, headers=security_headers())


@public_router.get("/share/scorecard/{token}/image", dependencies=[Depends(enforce_scorecard_share_rate_limit())])
async def public_scorecard_image(token: str, db: Annotated[AsyncSession, Depends(get_db)]) -> Response:
    if not settings.SCORECARD_SHARE_IMAGE_ENABLED:
        return _public_not_found(media_type="image/svg+xml")
    loaded = await _public_or_404(token, db, record_access=False)
    if loaded is None:
        return _public_not_found(media_type="image/svg+xml")
    share, card = loaded
    return Response(content=render_svg(public_view(share, card)), media_type="image/svg+xml", headers=security_headers())
