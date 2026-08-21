from __future__ import annotations

import random
from datetime import datetime, timedelta, timezone
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Body, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from redis.asyncio import Redis

from config import settings
from database import get_db
from dependencies import enforce_challenge_send_rate_limit, get_current_user, get_redis
from models.enums import QuizChallengeStatus
from models.flashcard import Flashcard, FlashcardSet
from models.quiz import QuizChallenge
from models.user import User
from services.achievement_sync import sync_user_achievements
from services.credits import consume_extra_credits, get_user_balance
from services.usage_events import current_period_start
from schemas.quiz_api import ChallengeQuestionOut, ChallengeSessionOut, QuizChallengeCreate
from services.entitlements import Action, can_user_do

QUESTIONS_PER_SESSION = 20
OPTIONS_PER_QUESTION = 4

# The only status transition a client can request via PATCH. Expiry is applied server-side
# (see the expires_at check in patch_challenge / get_challenge_session), never client-requested;
# "active" is not reachable from any current flow.
CLIENT_ALLOWED_STATUS_TRANSITIONS: dict[QuizChallengeStatus, set[str]] = {
    QuizChallengeStatus.pending: {"completed"},
}

# Free-plan recipients get one free completion per distinct challenge (so the social loop keeps
# working across many friends/invites) capped at this many completions/month, so a cooperating
# sender can't turn it into unlimited free quizzing. Recipients whose own plan already grants
# can_send_challenges are unaffected by this cap — see _challenge_completion_eligibility.
FREE_MONTHLY_CHALLENGE_COMPLETIONS = 5

router = APIRouter(tags=["quiz-challenges"])


async def _require_challenge_access(db: AsyncSession, user: User) -> None:
    """Sender-side gate only — kept on create_challenge. Recipients viewing/playing/completing
    their own challenge are handled by _challenge_completion_eligibility instead (free-sample)."""
    decision = await can_user_do(db, user, Action.SEND_CHALLENGE)
    if not decision.get("allowed"):
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail={"code": "UPGRADE_REQUIRED", "message": "Quiz challenges require a Standard 15 or Premium 30 plan."},
        )


async def _free_sample_completions_this_month(db: AsyncSession, user_id: UUID) -> int:
    period_start = current_period_start(lifetime=False)
    n = await db.scalar(
        select(func.count(QuizChallenge.id)).where(
            QuizChallenge.challengee_id == user_id,
            QuizChallenge.status == QuizChallengeStatus.completed,
            QuizChallenge.completed_at.is_not(None),
            QuizChallenge.completed_at >= period_start,
        ),
    )
    return int(n or 0)


async def _challenge_completion_eligibility(db: AsyncSession, user: User) -> dict[str, Any]:
    """Can `user` (the challengee) play/complete a challenge right now? Checked at session-start
    (get_challenge_session, before time is invested) and re-checked at PATCH-completion time.

    Recipients whose own plan already grants can_send_challenges (Standard 15+/Premium 30)
    get their normal plan-level access — no sample cap — but still spend 1 purchased
    credit per completion, unchanged from before. Free-plan (and Quick 7) recipients get a
    bounded number of free completions per month instead of any credit charge.
    """
    decision = await can_user_do(db, user, Action.SEND_CHALLENGE)
    if decision.get("allowed"):
        balance = await get_user_balance(db, user.id, pool="purchased")
        if balance < 1:
            return {
                "allowed": False,
                "code": "INSUFFICIENT_CREDITS",
                "message": "You need at least 1 credit to complete this challenge.",
            }
        return {"allowed": True, "free_sample": False}

    used = await _free_sample_completions_this_month(db, user.id)
    if used >= FREE_MONTHLY_CHALLENGE_COMPLETIONS:
        return {
            "allowed": False,
            "code": "CHALLENGE_SAMPLE_LIMIT_REACHED",
            "message": (
                f"You've used your {FREE_MONTHLY_CHALLENGE_COMPLETIONS} free challenge "
                "completions this month. Upgrade to keep playing."
            ),
        }
    return {"allowed": True, "free_sample": True}


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
    # No entitlement gate: recipients (any plan) must be able to see challenges sent to them —
    # the gate lives only on create_challenge (sending).
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


@router.post(
    "/",
    response_model=dict[str, Any],
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(enforce_challenge_send_rate_limit())],
)
async def create_challenge(
    body: QuizChallengeCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    redis: Annotated[Redis, Depends(get_redis)],
) -> dict[str, Any]:
    await _require_challenge_access(db, current_user)
    er = await db.execute(select(User).where(User.email == body.opponent_email.strip().lower()))
    challengee = er.scalar_one_or_none()
    if challengee is None or challengee.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unable to send challenge to that address.",
        )

    max_recipients = settings.CHALLENGE_SEND_RATE_LIMIT_MAX_RECIPIENTS_PER_DAY
    if max_recipients > 0:
        recipients_key = f"challenge-send-recipients:rl:{current_user.id}"
        added = await redis.sadd(recipients_key, str(challengee.id))
        if added:
            await redis.expire(recipients_key, 86400)
        if await redis.scard(recipients_key) > max_recipients:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail={
                    "code": "CHALLENGE_RECIPIENT_LIMIT_REACHED",
                    "message": "You've challenged a lot of different people today — try again tomorrow.",
                },
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


def _build_challenge_questions(cards: list[Flashcard], seed: str) -> list[ChallengeQuestionOut]:
    rng = random.Random(seed)
    pool = list(cards)
    rng.shuffle(pool)
    selected = pool[: min(QUESTIONS_PER_SESSION, len(pool))]
    questions: list[ChallengeQuestionOut] = []
    for card in selected:
        distractor_pool = [c for c in cards if c.back != card.back]
        rng.shuffle(distractor_pool)
        wrong = [c.back for c in distractor_pool[: OPTIONS_PER_QUESTION - 1]]
        while len(wrong) < OPTIONS_PER_QUESTION - 1:
            wrong.append("None of the above")
        options = [card.back, *wrong]
        rng.shuffle(options)
        questions.append(
            ChallengeQuestionOut(
                question=card.front,
                options=options,
                correct_answer=card.back,
                chapter=card.chapter,
                difficulty=card.difficulty or "medium",
                cognitive_level=card.cognitive_level,
            ),
        )
    return questions


@router.get("/{challenge_id}/session", response_model=ChallengeSessionOut)
async def get_challenge_session(
    challenge_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ChallengeSessionOut:
    """Scoped play data for a challenge recipient — derives MCQ questions server-side so the
    challenger's raw deck (every card, all metadata) never leaves the server for a non-owner.
    Deliberately does NOT require the Challenges plan entitlement: a Free-plan recipient must be
    able to play their own pending challenge (the free-sample model)."""
    ch = await db.get(QuizChallenge, challenge_id)
    if ch is None:
        raise HTTPException(status_code=404, detail="Challenge not found")
    if ch.challengee_id != current_user.id:
        raise HTTPException(status_code=403, detail="Forbidden")

    if ch.expires_at is not None and datetime.now(timezone.utc) > ch.expires_at:
        if ch.status in (QuizChallengeStatus.pending, QuizChallengeStatus.active):
            ch.status = QuizChallengeStatus.expired
            await db.commit()
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail={"code": "CHALLENGE_EXPIRED", "message": "This challenge has expired."},
        )

    if ch.status not in (QuizChallengeStatus.pending, QuizChallengeStatus.active):
        raise HTTPException(status_code=400, detail="Challenge is not available to play.")

    # Checked here (before the recipient invests time playing), not just at completion time.
    eligibility = await _challenge_completion_eligibility(db, current_user)
    if not eligibility["allowed"]:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail={"code": eligibility["code"], "message": eligibility["message"]},
        )

    fset = await db.get(FlashcardSet, ch.set_id)
    # Deck must belong to the challenger who created the challenge (no arbitrary set_id reads).
    if fset is None or fset.user_id != ch.challenger_id:
        raise HTTPException(status_code=404, detail="Challenge content not found")

    cr = await db.execute(select(Flashcard).where(Flashcard.set_id == fset.id))
    cards = cr.scalars().all()
    if not cards:
        raise HTTPException(status_code=404, detail="Challenge content not found")

    rd = ch.result_data or {}
    questions = _build_challenge_questions(list(cards), seed=str(ch.id))
    return ChallengeSessionOut(
        challenge_id=ch.id,
        set_title=rd.get("set_title") or fset.title,
        questions=questions,
    )


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

    if ch.expires_at is not None and datetime.now(timezone.utc) > ch.expires_at:
        if ch.status in (QuizChallengeStatus.pending, QuizChallengeStatus.active):
            ch.status = QuizChallengeStatus.expired
            await db.commit()
            await db.refresh(ch)
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail={"code": "CHALLENGE_EXPIRED", "message": "This challenge has expired."},
        )

    rd = dict(ch.result_data or {})
    patch = dict(body)
    status_val = patch.pop("status", None)

    is_challenger = ch.challenger_id == current_user.id
    is_challengee = ch.challengee_id == current_user.id

    # Status is only ever advanced by the opponent completing a pending challenge — every other
    # transition (re-opening a completed challenge, self-expiring, jumping straight to "active",
    # etc.) is rejected outright rather than silently applied.
    if status_val == "completed" and ch.status == QuizChallengeStatus.completed:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "CHALLENGE_ALREADY_ACCEPTED", "message": "This challenge has already been accepted and completed."},
        )
    if status_val is not None and status_val not in CLIENT_ALLOWED_STATUS_TRANSITIONS.get(ch.status, set()):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "INVALID_STATUS_TRANSITION",
                "message": f"Cannot move a {ch.status.value} challenge to '{status_val}'.",
            },
        )

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

        # Re-checked here (not just at session-start) in case eligibility changed mid-play.
        eligibility = await _challenge_completion_eligibility(db, current_user)
        if not eligibility["allowed"]:
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail={"code": eligibility["code"], "message": eligibility["message"]},
            )
        if not eligibility["free_sample"]:
            # Paying-plan recipient: normal plan access, unchanged — still 1 purchased credit/completion.
            await consume_extra_credits(
                db,
                current_user.id,
                amount=1,
                reason="Accepted Challenge",
                metadata={"challenge_id": str(ch.id), "set_id": str(ch.set_id)},
            )
        # Free-plan recipient: no credit charge — bounded instead by the monthly free-sample cap.

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
        ch.completed_at = datetime.now(timezone.utc)

    ch.result_data = rd
    flag_modified(ch, "result_data")
    await db.commit()
    await db.refresh(ch)
    cu = await db.get(User, ch.challenger_id)
    ce = await db.get(User, ch.challengee_id)
    fs = await db.get(FlashcardSet, ch.set_id)
    assert cu and ce and fs
    return _serialize_challenge(ch, cu, ce, fs)
