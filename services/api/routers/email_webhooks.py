"""Authenticated, idempotent lifecycle provider webhook hooks."""

import base64
import hashlib
import hmac
import json
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert

from config import settings
from database_sync import sync_session
from models.email import EmailJob, EmailProviderEvent, EmailSuppression
from services.lifecycle_email import _log

router = APIRouter(tags=["email-provider"])


def verify_webhook(
    body: bytes, message_id: str, timestamp: str, signatures: str
) -> bool:
    if (
        not settings.EMAIL_WEBHOOK_SECRET
        or not message_id
        or not timestamp
        or not signatures
    ):
        return False
    try:
        if abs(datetime.now(UTC).timestamp() - int(timestamp)) > 300:
            return False
        secret_text = settings.EMAIL_WEBHOOK_SECRET.removeprefix("whsec_")
        secret = base64.b64decode(secret_text)
        expected = base64.b64encode(
            hmac.new(
                secret,
                message_id.encode() + b"." + timestamp.encode() + b"." + body,
                hashlib.sha256,
            ).digest()
        ).decode()
        return any(
            hmac.compare_digest(expected, value.removeprefix("v1,"))
            for value in signatures.split()
        )
    except (ValueError, TypeError):
        return False


def process_provider_event(
    event_id: str, event_type: str, provider_message_id: str, data: dict
) -> bool:
    """Persist and apply one event; return False for a safe duplicate."""
    with sync_session() as db:
        job = (
            db.scalar(
                select(EmailJob).where(
                    EmailJob.provider_message_id == provider_message_id
                )
            )
            if provider_message_id
            else None
        )
        inserted = db.scalar(
            insert(EmailProviderEvent)
            .values(
                provider_event_id=event_id,
                event_type=event_type,
                email_job_id=job.id if job else None,
                safe_metadata={"provider_message_id": provider_message_id},
            )
            .on_conflict_do_nothing(
                index_elements=[EmailProviderEvent.provider_event_id]
            )
            .returning(EmailProviderEvent.provider_event_id)
        )
        if inserted is None:
            return False
        if job:
            mapped = {
                "email.delivered": "delivery_confirmed",
                "email.bounced": "bounced",
                "email.complained": "complained",
                "email.failed": "provider_rejected",
            }.get(event_type)
            if mapped:
                _log(
                    db,
                    job,
                    mapped,
                    job.status,
                    job.status,
                    provider="resend",
                    provider_message_id=provider_message_id,
                )
            bounce = str(data.get("bounce_type") or data.get("type") or "").lower()
            permanent_bounce = event_type == "email.bounced" and bounce not in {
                "transient",
                "temporary",
                "soft",
            }
            if event_type == "email.complained" or permanent_bounce:
                reason = "hard_bounce" if event_type == "email.bounced" else "complaint"
                db.execute(
                    insert(EmailSuppression)
                    .values(
                        user_id=job.user_id,
                        scope="global",
                        reason=reason,
                        provider_event_id=event_id,
                    )
                    .on_conflict_do_nothing(
                        index_elements=[
                            EmailSuppression.user_id,
                            EmailSuppression.scope,
                            EmailSuppression.reason,
                        ]
                    )
                )
        return True


@router.post("/webhook")
async def email_provider_webhook(request: Request) -> dict[str, bool]:
    body = await request.body()
    event_id = request.headers.get("svix-id", "")
    if not verify_webhook(
        body,
        event_id,
        request.headers.get("svix-timestamp", ""),
        request.headers.get("svix-signature", ""),
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid webhook signature"
        )
    try:
        event = json.loads(body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid payload") from None
    event_type = str(event.get("type") or "unknown")[:64]
    data = event.get("data") if isinstance(event.get("data"), dict) else {}
    provider_message_id = str(data.get("email_id") or data.get("id") or "")[:255]
    processed = process_provider_event(event_id, event_type, provider_message_id, data)
    return {"ok": True, "duplicate": not processed}
