"""Synchronous Anthropic helper for UI flows (chapter summaries, etc.)."""

from __future__ import annotations

import json
import re
from typing import Annotated, Any
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from anthropic_client import CLAUDE_SONNET_MODEL, get_anthropic_client
from database_sync import sync_session
from dependencies import get_current_user
from models.quiz import StudyEvent
from models.user import User
from token_usage_log import log_token_usage

router = APIRouter(tags=["ai"])


class AiInvokeBody(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=200_000)
    response_json_schema: dict[str, Any] | None = None


@router.post("/invoke", response_model=dict[str, Any])
async def invoke_llm(
    body: AiInvokeBody,
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict[str, Any]:
    try:
        client = get_anthropic_client()
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Anthropic API not configured",
        ) from exc

    schema_hint = ""
    if body.response_json_schema:
        schema_hint = "\nRespond with ONLY valid JSON matching this JSON Schema:\n" + json.dumps(
            body.response_json_schema,
        )
    msg = client.messages.create(
        model=CLAUDE_SONNET_MODEL,
        max_tokens=4096,
        messages=[{"role": "user", "content": body.prompt + schema_hint}],
    )
    log_token_usage(
        task="invoke",
        user_id=current_user.id,
        input_tokens=msg.usage.input_tokens,
        output_tokens=msg.usage.output_tokens,
        model=CLAUDE_SONNET_MODEL,
    )
    with sync_session() as db:
        db.add(
            StudyEvent(
                user_id=current_user.id,
                event_type="ai_generation",
            ),
        )

    raw = "".join(b.text for b in msg.content if getattr(b, "type", None) == "text")
    m = re.search(r"\{[\s\S]*\}", raw)
    if not m:
        raise HTTPException(status_code=400, detail="Model did not return JSON")
    try:
        return json.loads(m.group())
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Invalid JSON from model") from exc
