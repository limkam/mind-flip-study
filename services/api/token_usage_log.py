"""Sync token usage persistence for Celery workers."""

from __future__ import annotations

import logging
from uuid import UUID

from anthropic_client import CLAUDE_SONNET_MODEL
from database_sync import sync_session
from models.token_usage import TokenUsage
from services.ai_pricing import calculate_cost_usd

log = logging.getLogger(__name__)

def estimate_cost_usd(
    *,
    input_tokens: int,
    output_tokens: int,
    cached_tokens: int = 0,
    cache_read_tokens: int = 0,
    cache_creation_tokens: int = 0,
    model: str = CLAUDE_SONNET_MODEL,
) -> float:
    return calculate_cost_usd(
        model=model,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        cache_read_tokens=cache_read_tokens or cached_tokens,
        cache_creation_tokens=cache_creation_tokens,
    )


def _feature_type_from_task(task: str) -> str:
    mapping = {
        "generate_flashcards": "flashcards",
        "generate_chapter_summary": "summary",
        "generate_study_content": "flashcards",
        "repair_flashcards": "flashcards",
        "micro_repair_flashcards": "flashcards",
        "repair_scenarios": "flashcards",
        "generate_summary": "summary",
        "generate_scenarios": "flashcards",
        "regenerate_scenarios": "flashcards",
        "extract_toc": "toc",
        "infer_metadata": "metadata",
        "invoke": "other",
    }
    return mapping.get(task, task.split("_")[0] if task else "other")


def log_token_usage(
    *,
    task: str,
    user_id: UUID | str,
    input_tokens: int,
    output_tokens: int,
    model: str = CLAUDE_SONNET_MODEL,
    celery_task_id: str | None = None,
    cached_tokens: int = 0,
    cache_read_tokens: int = 0,
    cache_creation_tokens: int = 0,
    duration_ms: int | None = None,
    feature_type: str | None = None,
    book_id: UUID | str | None = None,
    call_metadata: dict | None = None,
) -> float:
    uid = user_id if isinstance(user_id, UUID) else UUID(str(user_id))
    bid: UUID | None = None
    if book_id is not None:
        bid = book_id if isinstance(book_id, UUID) else UUID(str(book_id))
    ft = feature_type or _feature_type_from_task(task)
    cost = estimate_cost_usd(
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        cached_tokens=cached_tokens,
        cache_read_tokens=cache_read_tokens,
        cache_creation_tokens=cache_creation_tokens,
        model=model,
    )
    log.info(
        "anthropic_token_usage",
        extra={
            "ai_task": task,
            "feature_type": ft,
            "user_id": str(uid),
            "book_id": str(bid) if bid else None,
            "model": model,
            "input_tokens": int(input_tokens),
            "output_tokens": int(output_tokens),
            "cached_tokens": int(cached_tokens),
            "cache_read_tokens": int(cache_read_tokens),
            "cache_creation_tokens": int(cache_creation_tokens),
            "duration_ms": duration_ms,
            "estimated_cost_usd": round(cost, 6),
            "celery_task_id": celery_task_id,
            "call_metadata": call_metadata,
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
                cached_tokens=int(cached_tokens),
                duration_ms=duration_ms,
                feature_type=ft,
                book_id=bid,
                celery_task_id=celery_task_id,
                estimated_cost_usd=cost,
                provider="anthropic",
                status="succeeded",
                provider_request_id=(str((call_metadata or {}).get("provider_request_id")) if (call_metadata or {}).get("provider_request_id") else None),
                cache_read_tokens=int(cache_read_tokens),
                cache_creation_tokens=int(cache_creation_tokens),
                call_metadata=call_metadata,
            ),
        )
    return cost


def log_failed_ai_request(*, task: str, user_id: UUID | str, model: str,
                          duration_ms: int | None, error: Exception,
                          celery_task_id: str | None = None, book_id: UUID | str | None = None,
                          feature_type: str | None = None) -> None:
    uid = user_id if isinstance(user_id, UUID) else UUID(str(user_id))
    bid = None if book_id is None else (book_id if isinstance(book_id, UUID) else UUID(str(book_id)))
    with sync_session() as db:
        db.add(TokenUsage(
            user_id=uid, task=task, model=model, provider="anthropic", status="failed",
            input_tokens=0, output_tokens=0, cached_tokens=0, cache_read_tokens=0,
            cache_creation_tokens=0, estimated_cost_usd=0, duration_ms=duration_ms,
            error_code=type(error).__name__, error_message=str(error)[:1000],
            celery_task_id=celery_task_id, book_id=bid,
            feature_type=feature_type or _feature_type_from_task(task),
        ))
