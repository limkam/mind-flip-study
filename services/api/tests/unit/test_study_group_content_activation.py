from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from fastapi import HTTPException

import routers.study_groups as study_groups


def _user():
    return SimpleNamespace(id=uuid4())


def _material(group_id):
    return SimpleNamespace(id=uuid4(), group_id=group_id, book_id=uuid4(), added_by=uuid4())


@pytest.mark.asyncio
async def test_activate_shared_material_is_noop_for_the_materials_own_uploader(monkeypatch):
    """The member who shared the material already owns it and already paid quota for it at
    upload time — activating it again must not consume a second book/set slot."""
    group_id = uuid4()
    user = _user()
    mat = SimpleNamespace(id=uuid4(), group_id=group_id, book_id=uuid4(), added_by=user.id)
    fset = SimpleNamespace(id=uuid4())

    monkeypatch.setattr(study_groups, "_require_member", AsyncMock(return_value=SimpleNamespace(id=group_id)))
    monkeypatch.setattr(study_groups, "_resolve_material_set", AsyncMock(return_value=fset))
    record_usage = AsyncMock()
    monkeypatch.setattr(study_groups, "record_usage", record_usage)
    can_user_do = AsyncMock()
    monkeypatch.setattr(study_groups, "can_user_do", can_user_do)

    db = AsyncMock()
    db.get = AsyncMock(return_value=mat)

    result = await study_groups.activate_shared_material(group_id=group_id, material_id=mat.id, current_user=user, db=db)

    assert result == {"material_id": str(mat.id), "set_id": str(fset.id), "activated": True}
    record_usage.assert_not_awaited()
    can_user_do.assert_not_awaited()


@pytest.mark.asyncio
async def test_activation_preview_is_free_for_the_materials_own_uploader(monkeypatch):
    group_id = uuid4()
    user = _user()
    mat = SimpleNamespace(id=uuid4(), group_id=group_id, book_id=uuid4(), added_by=user.id)
    fset = SimpleNamespace(id=uuid4())

    monkeypatch.setattr(study_groups, "_require_member", AsyncMock(return_value=SimpleNamespace(id=group_id)))
    monkeypatch.setattr(study_groups, "_resolve_material_set", AsyncMock(return_value=fset))
    db = AsyncMock()
    db.get = AsyncMock(side_effect=[mat, SimpleNamespace(id=mat.book_id, title="Organic Chemistry")])

    result = await study_groups.get_material_activation_preview(
        group_id=group_id, material_id=mat.id, current_user=user, db=db,
    )

    assert result["already_activated"] is True
    assert result["is_own"] is True
    assert result["set_id"] == str(fset.id)
    assert result["book_title"] == "Organic Chemistry"


@pytest.mark.asyncio
async def test_activation_preview_flags_previously_charged_when_deactivated(monkeypatch):
    """A deactivated (but previously charged) activation must be distinguished from a brand
    new one, so the frontend can tell the user reactivating is free instead of claiming it
    will use one of their remaining slots."""
    group_id = uuid4()
    mat = _material(group_id)
    existing = SimpleNamespace(id=uuid4(), set_id=uuid4(), deactivated_at=datetime.now(timezone.utc))

    monkeypatch.setattr(study_groups, "_require_member", AsyncMock(return_value=SimpleNamespace(id=group_id)))
    monkeypatch.setattr(study_groups, "_remaining_slots", AsyncMock(return_value={"book_slots_remaining": 0, "set_slots_remaining": 0}))
    db = AsyncMock()
    db.get = AsyncMock(side_effect=[mat, SimpleNamespace(id=mat.book_id, title="Organic Chemistry")])
    db.scalar = AsyncMock(return_value=existing)

    result = await study_groups.get_material_activation_preview(
        group_id=group_id, material_id=mat.id, current_user=_user(), db=db,
    )

    assert result["already_activated"] is False
    assert result["previously_charged"] is True


@pytest.mark.asyncio
async def test_activate_shared_material_success_consumes_book_and_set_quota(monkeypatch):
    group_id = uuid4()
    mat = _material(group_id)
    fset = SimpleNamespace(id=uuid4())
    user = _user()

    monkeypatch.setattr(study_groups, "_require_member", AsyncMock(return_value=SimpleNamespace(id=group_id)))
    monkeypatch.setattr(study_groups, "_resolve_material_set", AsyncMock(return_value=fset))
    monkeypatch.setattr(study_groups, "can_user_do", AsyncMock(return_value={"allowed": True}))
    monkeypatch.setattr(study_groups, "_user_plan_slug", AsyncMock(return_value="standard_15"))
    record_usage = AsyncMock()
    monkeypatch.setattr(study_groups, "record_usage", record_usage)

    db = AsyncMock()
    db.scalar = AsyncMock(return_value=None)  # no existing activation row
    db.get = AsyncMock(side_effect=[mat, SimpleNamespace(id=mat.book_id)])  # material, then book
    db.add = MagicMock()
    db.commit = AsyncMock()

    result = await study_groups.activate_shared_material(
        group_id=group_id, material_id=mat.id, current_user=user, db=db,
    )

    assert result["activated"] is True
    assert result["set_id"] == str(fset.id)
    db.add.assert_called_once()
    added_row = db.add.call_args[0][0]
    assert isinstance(added_row, study_groups.StudyGroupContentActivation)
    assert added_row.set_id == fset.id
    assert added_row.book_id == mat.book_id
    assert record_usage.await_count == 2
    event_types = {call.kwargs["event_type"] for call in record_usage.await_args_list}
    assert event_types == {study_groups.BOOK_UPLOADED, study_groups.FLASHCARDS_GENERATED}


@pytest.mark.asyncio
async def test_activate_shared_material_blocked_returns_402_with_slots(monkeypatch):
    group_id = uuid4()
    mat = _material(group_id)
    fset = SimpleNamespace(id=uuid4())
    user = _user()

    monkeypatch.setattr(study_groups, "_require_member", AsyncMock(return_value=SimpleNamespace(id=group_id)))
    monkeypatch.setattr(study_groups, "_resolve_material_set", AsyncMock(return_value=fset))
    monkeypatch.setattr(study_groups, "can_user_do", AsyncMock(return_value={"allowed": False, "reason": "book_limit"}))
    monkeypatch.setattr(study_groups, "_remaining_slots", AsyncMock(return_value={"book_slots_remaining": 0, "set_slots_remaining": 3}))

    db = AsyncMock()
    db.scalar = AsyncMock(return_value=None)
    db.get = AsyncMock(side_effect=[mat, SimpleNamespace(id=mat.book_id)])
    record_usage = AsyncMock()
    monkeypatch.setattr(study_groups, "record_usage", record_usage)

    with pytest.raises(HTTPException) as exc:
        await study_groups.activate_shared_material(group_id=group_id, material_id=mat.id, current_user=user, db=db)

    assert exc.value.status_code == 402
    assert exc.value.detail["code"] == "UPGRADE_REQUIRED"
    assert exc.value.detail["book_slots_remaining"] == 0
    record_usage.assert_not_awaited()


@pytest.mark.asyncio
async def test_activate_shared_material_already_active_is_idempotent(monkeypatch):
    group_id = uuid4()
    mat = _material(group_id)
    user = _user()
    existing = SimpleNamespace(id=uuid4(), set_id=uuid4(), deactivated_at=None)

    monkeypatch.setattr(study_groups, "_require_member", AsyncMock(return_value=SimpleNamespace(id=group_id)))

    db = AsyncMock()
    db.get = AsyncMock(return_value=mat)
    db.scalar = AsyncMock(return_value=existing)
    record_usage = AsyncMock()
    monkeypatch.setattr(study_groups, "record_usage", record_usage)

    result = await study_groups.activate_shared_material(group_id=group_id, material_id=mat.id, current_user=user, db=db)

    assert result == {"material_id": str(mat.id), "set_id": str(existing.set_id), "activated": True}
    record_usage.assert_not_awaited()


@pytest.mark.asyncio
async def test_reactivating_previously_charged_material_skips_quota_check_and_ledger_charge(monkeypatch):
    """A material that was activated once, then deactivated, was already charged permanently
    (see test_activate_shared_material_success_consumes_book_and_set_quota). Reactivating it
    must not run the quota gate and must not record a second ledger charge — otherwise a user
    sitting exactly at their limit could be wrongly blocked from re-adding something they
    already paid for, or (if allowed) billed for the same material twice."""
    group_id = uuid4()
    mat = _material(group_id)
    fset = SimpleNamespace(id=uuid4())
    user = _user()
    existing = SimpleNamespace(id=uuid4(), set_id=fset.id, deactivated_at=datetime.now(timezone.utc))

    monkeypatch.setattr(study_groups, "_require_member", AsyncMock(return_value=SimpleNamespace(id=group_id)))
    monkeypatch.setattr(study_groups, "_resolve_material_set", AsyncMock(return_value=fset))
    can_user_do = AsyncMock()
    monkeypatch.setattr(study_groups, "can_user_do", can_user_do)
    record_usage = AsyncMock()
    monkeypatch.setattr(study_groups, "record_usage", record_usage)

    db = AsyncMock()
    db.scalar = AsyncMock(return_value=existing)
    db.get = AsyncMock(side_effect=[mat, SimpleNamespace(id=mat.book_id)])
    db.commit = AsyncMock()

    result = await study_groups.activate_shared_material(
        group_id=group_id, material_id=mat.id, current_user=user, db=db,
    )

    assert result == {"material_id": str(mat.id), "set_id": str(fset.id), "activated": True}
    assert existing.deactivated_at is None
    can_user_do.assert_not_awaited()
    record_usage.assert_not_awaited()


@pytest.mark.asyncio
async def test_deactivate_shared_material_hides_without_refunding_quota(monkeypatch):
    """Deactivation is purely a visibility toggle. It must never touch the usage-event ledger —
    quota accounting (consumed_quantity) is a pure sum over ledger rows, so leaving the ledger
    untouched here is exactly what makes the charge permanent, same as deleting an owned book
    never refunds its ledger entry."""
    group_id = uuid4()
    material_id = uuid4()
    user = _user()
    activation = SimpleNamespace(id=uuid4(), deactivated_at=None)

    monkeypatch.setattr(study_groups, "_require_member", AsyncMock(return_value=SimpleNamespace(id=group_id)))
    db = AsyncMock()
    db.scalar = AsyncMock(return_value=activation)
    db.commit = AsyncMock()
    db.add = MagicMock()
    db.delete = AsyncMock()

    result = await study_groups.deactivate_shared_material(
        group_id=group_id, material_id=material_id, current_user=user, db=db,
    )

    assert result == {"material_id": str(material_id), "activated": False}
    assert activation.deactivated_at is not None
    db.commit.assert_awaited_once()
    db.add.assert_not_called()
    db.delete.assert_not_awaited()


@pytest.mark.asyncio
async def test_leave_group_deactivates_activations_and_removes_membership(monkeypatch):
    group_id = uuid4()
    user = _user()
    membership = SimpleNamespace(id=uuid4(), role="member")
    activation_1 = SimpleNamespace(id=uuid4(), deactivated_at=None)
    activation_2 = SimpleNamespace(id=uuid4(), deactivated_at=None)

    db = AsyncMock()
    db.scalar = AsyncMock(return_value=membership)
    scalars_result = MagicMock()
    scalars_result.all = MagicMock(return_value=[activation_1, activation_2])
    execute_result = MagicMock()
    execute_result.scalars = MagicMock(return_value=scalars_result)
    db.execute = AsyncMock(return_value=execute_result)
    db.delete = AsyncMock()
    db.commit = AsyncMock()

    await study_groups.leave_group(group_id=group_id, current_user=user, db=db)

    assert activation_1.deactivated_at is not None
    assert activation_2.deactivated_at is not None
    db.delete.assert_awaited_once_with(membership)
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_leave_group_404_when_not_a_member():
    db = AsyncMock()
    db.scalar = AsyncMock(return_value=None)

    with pytest.raises(HTTPException) as exc:
        await study_groups.leave_group(group_id=uuid4(), current_user=_user(), db=db)

    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_leave_group_blocked_when_owner_and_other_members_remain():
    """An owner leaving a group with other members still in it would strand the group with
    no one able to manage it — there's no ownership-transfer or member-removal endpoint yet,
    so this must be blocked rather than silently orphaning the group."""
    group_id = uuid4()
    user = _user()
    membership = SimpleNamespace(id=uuid4(), role="owner")

    db = AsyncMock()
    db.scalar = AsyncMock(side_effect=[membership, 2])  # membership lookup, then other-member count
    db.delete = AsyncMock()
    db.commit = AsyncMock()

    with pytest.raises(HTTPException) as exc:
        await study_groups.leave_group(group_id=group_id, current_user=user, db=db)

    assert exc.value.status_code == 400
    db.delete.assert_not_awaited()
    db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_leave_group_deletes_group_when_sole_owner_leaves():
    """A sole owner leaving has no one left to orphan — the group itself is removed instead
    of becoming a permanent, ownerless, zero-member group still visible in public search."""
    group_id = uuid4()
    user = _user()
    membership = SimpleNamespace(id=uuid4(), role="owner")
    group = SimpleNamespace(id=group_id)

    db = AsyncMock()
    db.scalar = AsyncMock(side_effect=[membership, 0])  # membership lookup, then other-member count
    execute_result = MagicMock()
    execute_result.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=[])))
    db.execute = AsyncMock(return_value=execute_result)
    db.get = AsyncMock(return_value=group)
    db.delete = AsyncMock()
    db.commit = AsyncMock()

    await study_groups.leave_group(group_id=group_id, current_user=user, db=db)

    db.delete.assert_awaited_once_with(group)
    db.commit.assert_awaited_once()
