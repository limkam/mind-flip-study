from typing import Any, Literal

from pydantic import BaseModel


class JobStatusResponse(BaseModel):
    status: Literal["pending", "started", "complete", "failed"]
    phase: str | None = None
    result: dict[str, Any] | list[Any] | str | float | int | None = None
    chapters_total: int | None = None
    chapters_done: int | None = None
    percent_complete: int | None = None
    current_chapter: str | None = None
    qa_status: str | None = None
    qa_failure_reason: str | None = None
    qa_failure_validator: str | None = None
    qa_attempt: int | None = None
    qa_failures: list[dict[str, Any]] | None = None
    generation_metrics: list[dict[str, Any]] | None = None


class JobEnqueueResponse(BaseModel):
    job_id: str
    set_id: str | None = None
    workbook_id: str | None = None
    reused: bool = False
    message: str | None = None
