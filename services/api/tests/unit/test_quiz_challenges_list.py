from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from models.enums import QuizChallengeStatus
from routers.quiz_challenges import list_challenges


class _Rows:
    def __init__(self, rows):
        self._rows = rows

    def scalars(self):
        return self

    def all(self):
        return self._rows


@pytest.mark.asyncio
async def test_list_challenges_batches_relationship_lookups():
    current_user = SimpleNamespace(id=uuid4())
    opponent = SimpleNamespace(id=uuid4(), email="opponent@example.test", full_name="Opponent")
    current_user.email = "learner@example.test"
    current_user.full_name = "Learner"
    set_one = SimpleNamespace(id=uuid4(), title="Set one")
    set_two = SimpleNamespace(id=uuid4(), title="Set two")
    challenges = [
        SimpleNamespace(id=uuid4(), challenger_id=current_user.id, challengee_id=opponent.id, set_id=set_one.id, status=QuizChallengeStatus.pending, result_data={}, created_at=datetime.now(UTC)),
        SimpleNamespace(id=uuid4(), challenger_id=opponent.id, challengee_id=current_user.id, set_id=set_two.id, status=QuizChallengeStatus.active, result_data={}, created_at=datetime.now(UTC)),
    ]
    db = SimpleNamespace(execute=AsyncMock(side_effect=[
        _Rows(challenges), _Rows([current_user, opponent]), _Rows([set_one, set_two]),
    ]))

    result = await list_challenges(current_user=current_user, db=db)

    assert len(result) == 2
    assert db.execute.await_count == 3
