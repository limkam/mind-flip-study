"""Public signed lifecycle unsubscribe endpoint; it cannot mutate email jobs directly."""

from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from database_sync import sync_session
from emails.unsubscribe import read_token
from models.email import EmailContact, EmailJob, EmailSuppression
from services.lifecycle_email import _log

router = APIRouter(tags=["email-preferences"])


@router.post("/unsubscribe/{token}")
@router.get("/unsubscribe/{token}")
def unsubscribe(token: str) -> dict[str, str]:
    try:
        public_id, scope, issued, _expires = read_token(token)
    except ValueError:
        raise HTTPException(
            status_code=400, detail="Invalid or expired unsubscribe link"
        ) from None
    now = datetime.now(UTC)
    with sync_session() as db:
        contact = db.scalar(
            select(EmailContact)
            .where(EmailContact.public_id == public_id)
            .with_for_update()
        )
        if contact is None or (
            contact.tokens_revoked_at
            and int(contact.tokens_revoked_at.timestamp()) >= issued
        ):
            raise HTTPException(
                status_code=400, detail="Invalid or expired unsubscribe link"
            )
        exists = db.scalar(
            select(EmailSuppression.id).where(
                EmailSuppression.user_id == contact.user_id,
                EmailSuppression.scope == scope,
                EmailSuppression.reason == "unsubscribe",
            )
        )
        if not exists:
            db.add(
                EmailSuppression(
                    user_id=contact.user_id, scope=scope, reason="unsubscribe"
                )
            )
        categories = (
            ("learning", "achievements", "weekly_summary")
            if scope == "global"
            else (scope,)
        )
        jobs = db.scalars(
            select(EmailJob)
            .where(
                EmailJob.user_id == contact.user_id,
                EmailJob.category.in_(categories),
                EmailJob.status.in_(("pending", "processing")),
            )
            .with_for_update()
        ).all()
        for job in jobs:
            old, job.status, job.cancelled_at = job.status, "cancelled", now
            _log(
                db,
                job,
                "cancelled",
                old,
                "cancelled",
                failure_category="cancelled",
                failure_reason="unsubscribe",
            )
    return {"status": "unsubscribed", "scope": scope}
