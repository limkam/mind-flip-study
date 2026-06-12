from typing import Any, Literal

from celery.result import AsyncResult
from typing import Annotated

from fastapi import APIRouter, Depends

from ai_generation import find_flashcard_set_for_job
from database_sync import sync_session
from dependencies import get_current_user
from job_cache import get_cached_job
from models.user import User
from schemas.job import JobStatusResponse
from tasks.celery_app import celery

router = APIRouter(tags=["jobs"])

def _map_state(state: str) -> Literal["pending", "started", "complete", "failed"]:
    if state == "PENDING":
        return "pending"
    if state in ("STARTED", "RETRY", "RECEIVED"):
        return "started"
    if state == "SUCCESS":
        return "complete"
    if state == "FAILURE":
        return "failed"
    return "started"


def _recover_set_id(task_id: str, user_id) -> str | None:
    cached = get_cached_job(task_id)
    if cached and cached.get("set_id"):
        return str(cached["set_id"])
    with sync_session() as db:
        row = find_flashcard_set_for_job(db, user_id=user_id, task_id=task_id)
        if row is not None:
            return str(row.id)
    return None


def _build_result(
    *,
    task_id: str,
    celery_state: str,
    celery_result: Any,
    user_id,
) -> dict[str, Any] | list[Any] | str | float | int | None:
    cached = get_cached_job(task_id)

    if celery_state == "SUCCESS":
        if isinstance(celery_result, dict):
            return celery_result
        if cached:
            return cached
        return celery_result

    if celery_state == "FAILURE":
        set_id = _recover_set_id(task_id, user_id)
        if set_id:
            return {"set_id": set_id, "recovered": True}
        err = celery_result
        if cached and cached.get("error"):
            return {"error": str(cached["error"])}
        return {"error": str(err)}

    if cached:
        return cached

    if celery_state in ("STARTED", "RETRY") and celery_result and isinstance(celery_result, dict):
        return celery_result

    return None


@router.get("/{job_id}", response_model=JobStatusResponse)
async def get_job_status(
    job_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
) -> JobStatusResponse:
    ar = AsyncResult(job_id, app=celery)
    st = ar.state or "PENDING"
    cached = get_cached_job(job_id)

    # Redis cache is authoritative when Celery reports failure but content was saved.
    if cached and cached.get("status") == "complete" and cached.get("set_id"):
        return JobStatusResponse(
            status="complete",
            phase=str(cached.get("phase") or "completed"),
            result=cached,
            qa_status=cached.get("qa_status"),
            qa_failure_reason=cached.get("qa_failure_reason"),
            qa_failure_validator=cached.get("qa_failure_validator"),
            qa_attempt=cached.get("qa_attempt"),
            qa_failures=cached.get("qa_failures"),
            generation_metrics=cached.get("generation_metrics"),
        )

    status = _map_state(st)
    result = _build_result(
        task_id=job_id,
        celery_state=st,
        celery_result=ar.result,
        user_id=current_user.id,
    )

    # Recover from false failure: DB has the set even though Celery failed/retried.
    if status == "failed" and isinstance(result, dict) and result.get("set_id"):
        status = "complete"

    phase = None
    chapters_total = None
    chapters_done = None
    percent_complete = None
    current_chapter = None
    qa_status = None
    qa_failure_reason = None
    qa_failure_validator = None
    qa_attempt = None
    qa_failures = None
    generation_metrics = None

    source = cached if cached else (result if isinstance(result, dict) else {})
    if isinstance(result, dict):
        phase = result.get("phase")
        chapters_total = result.get("chapters_total")
        chapters_done = result.get("chapters_done")
        percent_complete = result.get("percent_complete")
        current_chapter = result.get("current_chapter")
    if phase is None and cached:
        phase = cached.get("phase")
        chapters_total = chapters_total if chapters_total is not None else cached.get("chapters_total")
        chapters_done = chapters_done if chapters_done is not None else cached.get("chapters_done")
        percent_complete = percent_complete if percent_complete is not None else cached.get("percent_complete")
        current_chapter = current_chapter if current_chapter is not None else cached.get("current_chapter")

    if isinstance(source, dict):
        qa_status = source.get("qa_status")
        qa_failure_reason = source.get("qa_failure_reason")
        qa_failure_validator = source.get("qa_failure_validator")
        qa_attempt = source.get("qa_attempt")
        qa_failures = source.get("qa_failures")
        generation_metrics = source.get("generation_metrics")
    if phase is None:
        if status == "pending":
            phase = "queued"
        elif status == "started":
            phase = "generating_content"
        elif status == "complete":
            phase = "completed"
        elif status == "failed":
            phase = "failed"

    return JobStatusResponse(
        status=status,
        phase=phase,
        result=result,
        chapters_total=chapters_total,
        chapters_done=chapters_done,
        percent_complete=percent_complete,
        current_chapter=current_chapter,
        qa_status=qa_status,
        qa_failure_reason=qa_failure_reason,
        qa_failure_validator=qa_failure_validator,
        qa_attempt=qa_attempt,
        qa_failures=qa_failures,
        generation_metrics=generation_metrics,
    )
