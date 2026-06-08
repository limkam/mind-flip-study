"""Sync token usage persistence for Celery workers."""

from __future__ import annotations

import logging
from uuid import UUID

from anthropic_client import CLAUDE_SONNET_MODEL
from database_sync import sync_session
from models.token_usage import TokenUsage

log = logging.getLogger(__name__)

INPUT_COST_PER_1K = 0.003
OUTPUT_COST_PER_1K = 0.015


def estimate_cost_usd(*, input_tokens: int, output_tokens: int) -> float:
    return (input_tokens / 1000 * INPUT_COST_PER_1K) + (output_tokens / 1000 * OUTPUT_COST_PER_1K)


def log_token_usage(
    *,
    task: str,
    user_id: UUID | str,
    input_tokens: int,
    output_tokens: int,
    model: str = CLAUDE_SONNET_MODEL,
    celery_task_id: str | None = None,
) -> float:
    uid = user_id if isinstance(user_id, UUID) else UUID(str(user_id))
    cost = estimate_cost_usd(input_tokens=input_tokens, output_tokens=output_tokens)
    log.info(
        "anthropic_token_usage",
        extra={
            "ai_task": task,
            "user_id": str(uid),
            "model": model,
            "input_tokens": int(input_tokens),
            "output_tokens": int(output_tokens),
            "estimated_cost_usd": round(cost, 6),
            "celery_task_id": celery_task_id,
        },
    )
    with sync_session() as db:
        db.add(
            TokenUsage(
                user_id=uid,
                task=task,
                model=model,
                input_tokens=int(input_tokens),
                output_tokens=int(output_tokens),
                estimated_cost_usd=cost,
            ),
        )
    return cost
