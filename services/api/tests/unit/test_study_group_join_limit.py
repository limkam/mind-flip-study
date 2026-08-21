import pytest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import routers.study_groups as study_groups


class _ExecResult:
    def __init__(self, value):
        self._value = value

    def scalar_one_or_none(self):
        return self._value


def _make_db(*, group, existing_member, joined_count):
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=[
        _ExecResult(group),
        _ExecResult(existing_member),
    ])
    db.scalar = AsyncMock(return_value=joined_count)
    db.commit = AsyncMock()
    db.add = MagicMock()
    return db


@pytest.mark.asyncio
async def test_free_user_blocked_joining_second_group(monkeypatch):
    user = SimpleNamespace(id=uuid4())
    group = SimpleNamespace(id=uuid4(), code="ABCD")
    db = _make_db(group=group, existing_member=None, joined_count=1)

    monkeypatch.setattr(
        study_groups, "can_user_do",
        AsyncMock(return_value={"allowed": False, "reason": "study_group_join_limit_reached", "limit": 1}),
    )
    serialize = AsyncMock()
    monkeypatch.setattr(study_groups, "_serialize_group", serialize)

    with pytest.raises(study_groups.HTTPException) as exc_info:
        await study_groups.join_group(
            body=study_groups.StudyGroupJoin(code="abcd"), current_user=user, db=db,
        )

    assert exc_info.value.status_code == 402
    assert exc_info.value.detail["code"] == "UPGRADE_REQUIRED"
    assert "1 study group" in exc_info.value.detail["message"]
    db.add.assert_not_called()
    db.commit.assert_not_called()


@pytest.mark.asyncio
async def test_free_user_can_join_first_group(monkeypatch):
    user = SimpleNamespace(id=uuid4())
    group = SimpleNamespace(id=uuid4(), code="ABCD")
    db = _make_db(group=group, existing_member=None, joined_count=0)

    monkeypatch.setattr(
        study_groups, "can_user_do",
        AsyncMock(return_value={"allowed": True}),
    )
    serialize = AsyncMock(return_value={"id": str(group.id), "is_member": True})
    monkeypatch.setattr(study_groups, "_serialize_group", serialize)

    result = await study_groups.join_group(
        body=study_groups.StudyGroupJoin(code="abcd"), current_user=user, db=db,
    )

    assert result["is_member"] is True
    db.add.assert_called_once()
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_paid_user_can_join_multiple_groups(monkeypatch):
    user = SimpleNamespace(id=uuid4())
    group = SimpleNamespace(id=uuid4(), code="ABCD")
    db = _make_db(group=group, existing_member=None, joined_count=3)

    can_user_do_mock = AsyncMock(return_value={"allowed": True})
    monkeypatch.setattr(study_groups, "can_user_do", can_user_do_mock)
    serialize = AsyncMock(return_value={"id": str(group.id), "is_member": True})
    monkeypatch.setattr(study_groups, "_serialize_group", serialize)

    result = await study_groups.join_group(
        body=study_groups.StudyGroupJoin(code="abcd"), current_user=user, db=db,
    )

    assert result["is_member"] is True
    can_user_do_mock.assert_awaited_once()
    assert can_user_do_mock.await_args.kwargs["count"] == 3


@pytest.mark.asyncio
async def test_rejoining_existing_group_is_idempotent_and_skips_limit_check(monkeypatch):
    """A user already in the group (idempotent re-join) must not be blocked by the
    join limit even if they're otherwise at/over it."""
    user = SimpleNamespace(id=uuid4())
    group = SimpleNamespace(id=uuid4(), code="ABCD")
    existing_member = SimpleNamespace(id=uuid4())
    db = _make_db(group=group, existing_member=existing_member, joined_count=1)

    can_user_do_mock = AsyncMock(return_value={"allowed": False})
    monkeypatch.setattr(study_groups, "can_user_do", can_user_do_mock)
    serialize = AsyncMock(return_value={"id": str(group.id), "is_member": True})
    monkeypatch.setattr(study_groups, "_serialize_group", serialize)

    result = await study_groups.join_group(
        body=study_groups.StudyGroupJoin(code="abcd"), current_user=user, db=db,
    )

    assert result["is_member"] is True
    can_user_do_mock.assert_not_called()
