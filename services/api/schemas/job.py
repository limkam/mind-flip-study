from typing import Any, Literal

from pydantic import BaseModel


class JobStatusResponse(BaseModel):
    status: Literal["pending", "started", "complete", "failed"]
    result: dict[str, Any] | list[Any] | str | float | int | None = None


class JobEnqueueResponse(BaseModel):
    job_id: str
