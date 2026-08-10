from types import SimpleNamespace
from typing import Literal
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi import HTTPException
from pydantic import TypeAdapter, ValidationError

from routers.engagement import _record_nudge_action


def test_current_nudge_rejects_invalid_placement():
    placement = TypeAdapter(Literal["dashboard", "learning"])
    with pytest.raises(ValidationError):
        placement.validate_python("modal")


@pytest.mark.asyncio
async def test_nudge_mutation_rejects_unknown_id_without_leaking_existence():
    db = AsyncMock()
    db.scalar = AsyncMock(return_value=None)
    user = SimpleNamespace(id=uuid4())
    with pytest.raises(HTTPException) as error:
        await _record_nudge_action(db, user.id, uuid4(), "dismissal", "unknown-id-attempt")
    assert error.value.status_code == 404
    assert error.value.detail == "Nudge not found"
