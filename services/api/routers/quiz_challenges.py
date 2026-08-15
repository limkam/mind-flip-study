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
from services.achievement_sync import sync_user_achievements
from services.credits import consume_extra_credits
from schemas.quiz_api import QuizChallengeCreate
from services.entitlements import Action, can_user_do

router = APIRouter(tags=["quiz-challenges"])


async def _require_challenge_access(db: AsyncSession, user: User) -> None:
    decision = await can_user_do(db, user, Action.SEND_CHALLENGE)
    if not decision.get("allowed"):
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail={"code": "UPGRADE_REQUIRED", "message": "Quiz challenges require a Quick 7, Standard 15, or Premium 30 plan."},
        )


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
        "challenger_score": rd.get("challenger_score"),
        "challenger_percentage": rd.get("challenger_percentage"),
        "challenger_time_seconds": rd.get("challenger_time_seconds"),
        "opponent_score": rd.get("opponent_score"),
        "opponent_percentage": rd.get("opponent_percentage"),
        "opponent_time_seconds": rd.get("opponent_time_seconds"),
        "winner_email": rd.get("winner_email"),
        "created_at": ch.created_at.isoformat() if ch.created_at else None,
    }


def _winner_email_from_scores(
    *,
    challenger_email: str,
    opponent_email: str,
    challenger_percentage: int,
    challenger_time_seconds: int,
    opponent_percentage: int,
    opponent_time_seconds: int,
) -> str:
    if opponent_percentage > challenger_percentage:
        return opponent_email
    if opponent_percentage < challenger_percentage:
        return challenger_email
    if opponent_time_seconds < challenger_time_seconds:
        return opponent_email
    return challenger_email


@router.get("/", response_model=list[dict[str, Any]])
async def list_challenges(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[dict[str, Any]]:
    await _require_challenge_access(db, current_user)
    r = await db.execute(
        select(QuizChallenge).where(
            (QuizChallenge.challenger_id == current_user.id) | (QuizChallenge.challengee_id == current_user.id),
        ),
    )
    challenges = r.scalars().all()
    user_ids = {ch.challenger_id for ch in challenges} | {ch.challengee_id for ch in challenges}
    set_ids = {ch.set_id for ch in challenges}
    users = {}
    sets = {}
    if user_ids:
        user_rows = (await db.execute(select(User).where(User.id.in_(user_ids)))).scalars().all()
        users = {user.id: user for user in user_rows}
    if set_ids:
        set_rows = (await db.execute(select(FlashcardSet).where(FlashcardSet.id.in_(set_ids)))).scalars().all()
        sets = {flashcard_set.id: flashcard_set for flashcard_set in set_rows}
    out: list[dict[str, Any]] = []
    for ch in challenges:
        cu = users.get(ch.challenger_id)
        ce = users.get(ch.challengee_id)
        fs = sets.get(ch.set_id)
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
    await _require_challenge_access(db, current_user)
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

    # Prevent duplicate active/pending challenge between same users for same content
    existing_dup = await db.execute(
        select(QuizChallenge).where(
            QuizChallenge.challenger_id == current_user.id,
            QuizChallenge.challengee_id == challengee.id,
            QuizChallenge.set_id == body.flashcard_set_id,
            QuizChallenge.status.in_((QuizChallengeStatus.pending, QuizChallengeStatus.active)),
        )
    )
    if existing_dup.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "DUPLICATE_CHALLENGE", "message": "A challenge already exists for this content."},
        )

    now = datetime.now(timezone.utc)
    rd = {
        "set_title": body.set_title or fset.title,
        "book_title": body.book_title,
        "challenger_email": current_user.email,
        "challenger_name": current_user.full_name,
        "opponent_email": challengee.email,
        "challenger_score": body.challenger_score,
        "challenger_percentage": body.challenger_percentage,
        "challenger_time_seconds": body.challenger_time_seconds,
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

    await sync_user_achievements(db, current_user.id)

    try:
        from tasks.notification_tasks import send_challenge_notification as notify_challenge_task

        notify_challenge_task.delay(str(ch.id))
    except Exception:
        pass

    try:
        from tasks.email_tasks import send_challenge_alert_task

        send_challenge_alert_task.delay(
            challengee.full_name,
            challengee.email,
            current_user.full_name,
            rd.get("set_title") or fset.title,
            int(body.challenger_percentage),
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

    await _require_challenge_access(db, current_user)

    rd = dict(ch.result_data or {})
    patch = dict(body)
    status_val = patch.pop("status", None)

    is_challenger = ch.challenger_id == current_user.id
    is_challengee = ch.challengee_id == current_user.id

    opponent_fields = {"opponent_score", "opponent_percentage", "opponent_time_seconds", "winner_email"}
    challenger_fields = {"challenger_score", "challenger_percentage", "challenger_time_seconds"}

    for k, v in patch.items():
        if k in opponent_fields and not is_challengee:
            raise HTTPException(status_code=403, detail="Only the opponent can submit quiz results.")
        if k in challenger_fields and not is_challenger:
            raise HTTPException(status_code=403, detail="Challenger scores are set when the challenge is sent.")
        rd[k] = v

    if status_val == "completed":
        if not is_challengee:
            raise HTTPException(status_code=403, detail="Only the opponent can complete the challenge.")
        if ch.status == QuizChallengeStatus.completed:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"code": "CHALLENGE_ALREADY_ACCEPTED", "message": "This challenge has already been accepted and completed."},
            )
        if ch.status != QuizChallengeStatus.pending:
            raise HTTPException(status_code=400, detail="Challenge is no longer pending.")
        
        # Deduct 1 extra credit from the opponent for accepting/completing the challenge
        await consume_extra_credits(
            db,
            current_user.id,
            amount=1,
            reason="Accepted Challenge",
            metadata={"challenge_id": str(ch.id), "set_id": str(ch.set_id)},
        )

        opp_pct = int(rd.get("opponent_percentage") or patch.get("opponent_percentage") or 0)
        opp_time = int(rd.get("opponent_time_seconds") or patch.get("opponent_time_seconds") or 9999)
        ch_pct = int(rd.get("challenger_percentage") or 0)
        ch_time = int(rd.get("challenger_time_seconds") or 9999)
        cu = await db.get(User, ch.challenger_id)
        ce = await db.get(User, ch.challengee_id)
        if cu and ce:
            rd["winner_email"] = _winner_email_from_scores(
                challenger_email=cu.email,
                opponent_email=ce.email,
                challenger_percentage=ch_pct,
                challenger_time_seconds=ch_time,
                opponent_percentage=opp_pct,
                opponent_time_seconds=opp_time,
            )
        ch.status = QuizChallengeStatus.completed
    elif status_val == "pending":
        ch.status = QuizChallengeStatus.pending
    elif status_val == "active":
        ch.status = QuizChallengeStatus.active
    elif status_val == "expired":
        ch.status = QuizChallengeStatus.expired

    ch.result_data = rd
    flag_modified(ch, "result_data")
    await db.commit()
    await db.refresh(ch)
    cu = await db.get(User, ch.challenger_id)
    ce = await db.get(User, ch.challengee_id)
    fs = await db.get(FlashcardSet, ch.set_id)
    assert cu and ce and fs
    return _serialize_challenge(ch, cu, ce, fs)
