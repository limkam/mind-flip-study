"""Leaderboard backed by Redis only (no PostgreSQL reads on request path)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from redis.asyncio import Redis

from dependencies import get_current_user, get_redis
from models.user import User
from schemas.pagination import total_pages

router = APIRouter(tags=["leaderboard"])

LEADERBOARD_KEY = "leaderboard:xp"
USER_META_PREFIX = "user:meta:"


class LeaderboardItemOut(BaseModel):
    rank: int
    user_id: str
    full_name: str
    avatar_url: str | None = None
    xp: float


class LeaderboardPageOut(BaseModel):
    items: list[LeaderboardItemOut]
    total: int
    page: int
    size: int
    has_more: bool
    total_pages: int


class LeaderboardMeOut(BaseModel):
    rank: int | None = Field(description="1-based rank, or null if not in leaderboard yet")
    xp: float


def _clamp_size(size: int) -> int:
    return max(1, min(size, 100))


async def _batch_hmget_user_meta(redis: Redis, user_ids: list[str]) -> list[tuple[str, str | None]]:
    """One round-trip: HMGET per user via a non-transactional pipeline (not MULTI/EXEC)."""
    if not user_ids:
        return []
    pipe = redis.pipeline(transaction=False)
    for uid in user_ids:
        pipe.hmget(f"{USER_META_PREFIX}{uid}", "full_name", "avatar_url")
    rows_raw: list = await pipe.execute()
    out: list[tuple[str, str | None]] = []
    for vals in rows_raw:
        fn = vals[0] if vals else None
        au = vals[1] if vals and len(vals) > 1 else None
        out.append((fn or "", au if au else None))
    return out


@router.get("", response_model=LeaderboardPageOut)
async def get_leaderboard(
    redis: Annotated[Redis, Depends(get_redis)],
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=100),
) -> LeaderboardPageOut:
    size = _clamp_size(size)
    total = int(await redis.zcard(LEADERBOARD_KEY) or 0)
    # Inclusive Redis indices; ZREVRANGE highest score first at index 0.
    start = (page - 1) * size
    stop = start + size - 1
    raw = await redis.zrevrange(LEADERBOARD_KEY, start, stop, withscores=True)

    user_ids: list[str] = []
    scores: list[float] = []
    for member, score in raw:
        user_ids.append(str(member))
        scores.append(float(score))

    if not user_ids:
        has_more = page * size < total
        tp = total_pages(total=total, size=size)
        return LeaderboardPageOut(items=[], total=total, page=page, size=size, has_more=has_more, total_pages=tp)

    meta_pairs = await _batch_hmget_user_meta(redis, user_ids)
    # Global 1-based rank: page 1 starts at 1; page 2 at (size + 1), etc.
    base_rank = start + 1
    items: list[LeaderboardItemOut] = []
    for i, uid in enumerate(user_ids):
        fn, au = meta_pairs[i]
        items.append(
            LeaderboardItemOut(
                rank=base_rank + i,
                user_id=uid,
                full_name=fn or "Anonymous",
                avatar_url=au,
                xp=scores[i],
            ),
        )
    has_more = page * size < total
    tp = total_pages(total=total, size=size)
    return LeaderboardPageOut(items=items, total=total, page=page, size=size, has_more=has_more, total_pages=tp)


@router.get("/me", response_model=LeaderboardMeOut)
async def get_my_leaderboard_rank(
    current_user: Annotated[User, Depends(get_current_user)],
    redis: Annotated[Redis, Depends(get_redis)],
) -> LeaderboardMeOut:
    uid = str(current_user.id)
    rev_rank = await redis.zrevrank(LEADERBOARD_KEY, uid)
    score_raw = await redis.zscore(LEADERBOARD_KEY, uid)
    # Not in ZSET (never refreshed, or removed): human-readable contract rank=null, xp=0.
    if rev_rank is None:
        return LeaderboardMeOut(rank=None, xp=0.0)
    # ZREVRANK is 0-based from highest score; UI shows 1-based rank.
    return LeaderboardMeOut(rank=int(rev_rank) + 1, xp=float(score_raw or 0.0))
