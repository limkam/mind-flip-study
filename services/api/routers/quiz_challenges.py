from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Body, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from database import get_db
from dependencies import get_current_user
from models.enums import QuizChallengeStatus
from models.flashcard import FlashcardSet
from models.quiz import QuizChallenge
from models.user import User
from schemas.quiz_api import QuizChallengeCreate

router = APIRouter(tags=["quiz-challenges"])


def _serialize_challenge(
    ch: QuizChallenge,
    challenger: User,
    challengee: User,
    fset: FlashcardSet,
) -> dict[str, Any]:
    rd = dict(ch.result_data or {})
    return {
        "id": str(ch.id),
        "flashcard_set_id": str(ch.set_id),
        "status": ch.status.value,
        "challenger_email": challenger.email,
        "challenger_name": challenger.full_name,
        "opponent_email": challengee.email,
        "opponent_name": challengee.full_name,
        "set_title": rd.get("set_title") or fset.title,
        "book_title": rd.get("book_title"),
        "challenger_percentage": rd.get("challenger_percentage"),
        "challenger_time_seconds": rd.get("challenger_time_seconds"),
        "opponent_percentage": rd.get("opponent_percentage"),
        "opponent_time_seconds": rd.get("opponent_time_seconds"),
        "winner_email": rd.get("winner_email"),
        "created_at": ch.created_at.isoformat() if ch.created_at else None,
    }


@router.get("/", response_model=list[dict[str, Any]])
async def list_challenges(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[dict[str, Any]]:
    r = await db.execute(
        select(QuizChallenge).where(
            (QuizChallenge.challenger_id == current_user.id) | (QuizChallenge.challengee_id == current_user.id),
        ),
    )
    challenges = r.scalars().all()
    out: list[dict[str, Any]] = []
    for ch in challenges:
        cu = await db.get(User, ch.challenger_id)
        ce = await db.get(User, ch.challengee_id)
        fs = await db.get(FlashcardSet, ch.set_id)
        if cu and ce and fs:
            out.append(_serialize_challenge(ch, cu, ce, fs))
    out.sort(key=lambda x: x.get("created_at") or "", reverse=True)
    return out


@router.post("/", response_model=dict[str, Any], status_code=status.HTTP_201_CREATED)
async def create_challenge(
    body: QuizChallengeCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    er = await db.execute(select(User).where(User.email == body.opponent_email.strip().lower()))
    challengee = er.scalar_one_or_none()
    if challengee is None or challengee.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unable to send challenge to that address.",
        )
    sr = await db.execute(
        select(FlashcardSet).where(FlashcardSet.id == body.flashcard_set_id, FlashcardSet.user_id == current_user.id),
    )
    fset = sr.scalar_one_or_none()
    if fset is None:
        raise HTTPException(status_code=404, detail="Flashcard set not found")
    now = datetime.now(timezone.utc)
    rd = {
        "set_title": body.set_title or fset.title,
        "book_title": body.book_title,
        "challenger_email": current_user.email,
        "challenger_name": current_user.full_name,
        "opponent_email": challengee.email,
    }
    ch = QuizChallenge(
        challenger_id=current_user.id,
        challengee_id=challengee.id,
        set_id=body.flashcard_set_id,
        status=QuizChallengeStatus.pending,
        expires_at=now + timedelta(days=7),
        result_data=rd,
    )
    db.add(ch)
    await db.commit()
    await db.refresh(ch)

    try:
        from tasks.notification_tasks import send_challenge_notification as notify_challenge_task

        notify_challenge_task.delay(str(ch.id))
    except Exception:
        pass

    try:
        from tasks.email_tasks import send_challenge_alert_task

        score = int(body.challenger_percentage or 0)
        send_challenge_alert_task.delay(
            challengee.full_name,
            challengee.email,
            current_user.full_name,
            rd.get("set_title") or fset.title,
            score,
            str(ch.id),
        )
    except Exception:
        pass

    return _serialize_challenge(ch, current_user, challengee, fset)


@router.patch("/{challenge_id}", response_model=dict[str, Any])
async def patch_challenge(
    challenge_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    body: dict[str, Any] = Body(...),
) -> dict[str, Any]:
    ch = await db.get(QuizChallenge, challenge_id)
    if ch is None:
        raise HTTPException(status_code=404, detail="Challenge not found")
    if ch.challenger_id != current_user.id and ch.challengee_id != current_user.id:
        raise HTTPException(status_code=403, detail="Forbidden")
    rd = dict(ch.result_data or {})
    patch = dict(body)
    status_val = patch.pop("status", None)
    for k, v in patch.items():
        rd[k] = v
    ch.result_data = rd
    flag_modified(ch, "result_data")
    if status_val == "completed":
        ch.status = QuizChallengeStatus.completed
    elif status_val == "pending":
        ch.status = QuizChallengeStatus.pending
    elif status_val == "active":
        ch.status = QuizChallengeStatus.active
    elif status_val == "expired":
        ch.status = QuizChallengeStatus.expired
    await db.commit()
    await db.refresh(ch)
    cu = await db.get(User, ch.challenger_id)
    ce = await db.get(User, ch.challengee_id)
    fs = await db.get(FlashcardSet, ch.set_id)
    assert cu and ce and fs
    return _serialize_challenge(ch, cu, ce, fs)
