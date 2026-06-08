from typing import Any, Literal

from celery.result import AsyncResult
from typing import Annotated

from fastapi import APIRouter, Depends

from dependencies import get_current_user
from models.user import User
from schemas.job import JobStatusResponse
from tasks.celery_app import celery

router = APIRouter(tags=["jobs"])


def _map_state(state: str) -> Literal["pending", "started", "complete", "failed"]:
    if state == "PENDING":
        return "pending"
    if state == "STARTED":
        return "started"
    if state == "SUCCESS":
        return "complete"
    return "failed"


@router.get("/{job_id}", response_model=JobStatusResponse)
async def get_job_status(
    job_id: str,
    _user: Annotated[User, Depends(get_current_user)],
) -> JobStatusResponse:
    ar = AsyncResult(job_id, app=celery)
    st = ar.state or "PENDING"
    status = _map_state(st)
    result: dict[str, Any] | list[Any] | str | float | int | None = None
    if st == "SUCCESS":
        result = ar.result
    elif st == "FAILURE":
        err = ar.result
        result = {"error": str(err)}
    elif st == "STARTED" and ar.info:
        result = ar.info if isinstance(ar.info, dict) else {"info": str(ar.info)}
    return JobStatusResponse(status=status, result=result)
