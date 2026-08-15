"""PostgreSQL lifecycle and concurrency evidence for the support chat."""
from __future__ import annotations

import asyncio
import os
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from fastapi import HTTPException
from starlette.requests import Request
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from models.enums import SupportCategory, SupportConversationStatus, SupportSenderType, UserRole
from models.feedback import Feedback, SupportConversation, SupportMessage
from models.user import User
from routers.admin import (get_support_conversation, list_support_conversations,
    reopen_support_conversation, reply_support_conversation, resolve_support_conversation, support_dashboard)
from routers.feedback import _send_user_message, create_feedback, get_conversation
from schemas.feedback import FeedbackCreate, SupportMessageCreate

pytestmark = pytest.mark.asyncio


def _request() -> Request:
    return Request({"type": "http", "method": "POST", "path": "/admin/feedback", "headers": [], "client": ("127.0.0.1", 1)})


@pytest.fixture
async def support_db():
    url = os.getenv("SUPPORT_CHAT_TEST_DATABASE_URL")
    if not url:
        pytest.skip("SUPPORT_CHAT_TEST_DATABASE_URL is required")
    engine = create_async_engine(url)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    marker = f"support-{uuid.uuid4()}"
    async with sessions() as db:
        user = User(email=f"{marker}-user@example.test", role=UserRole.student, full_name="Casey Student", preferences={}, subscription_tier="free", auth_provider="email")
        other = User(email=f"{marker}-other@example.test", role=UserRole.student, full_name="Jordan Other", preferences={}, subscription_tier="free", auth_provider="email")
        admin = User(email=f"{marker}-admin@example.test", role=UserRole.admin, full_name="Support Admin", preferences={}, subscription_tier="free", auth_provider="email")
        db.add_all([user, other, admin]); await db.commit()
    yield sessions, user, other, admin
    async with sessions() as db:
        ids = select(User.id).where(User.email.like(f"{marker}%"))
        conversations = select(SupportConversation.id).where(SupportConversation.user_id.in_(ids))
        await db.execute(SupportMessage.__table__.delete().where(SupportMessage.conversation_id.in_(conversations)))
        await db.execute(SupportConversation.__table__.delete().where(SupportConversation.user_id.in_(ids)))
        await db.execute(Feedback.__table__.delete().where(Feedback.user_id.in_(ids)))
        await db.execute(User.__table__.delete().where(User.email.like(f"{marker}%"))); await db.commit()
    await engine.dispose()


async def test_first_message_and_existing_conversation_reuse(support_db):
    sessions, user, _, _ = support_db
    async with sessions() as db:
        first = await _send_user_message(db, user, "First", uuid.uuid4())
        conversation = await db.get(SupportConversation, first.conversation_id)
        assert conversation.user_id == user.id and conversation.status == SupportConversationStatus.open
        assert conversation.admin_unread_count == 1 and conversation.user_unread_count == 0
        assert conversation.last_user_message_at == first.created_at == conversation.last_message_at
        original_activity = conversation.last_message_at
    async with sessions() as db:
        second = await _send_user_message(db, user, "Second", uuid.uuid4())
        assert second.conversation_id == first.conversation_id
        conversation = await db.get(SupportConversation, first.conversation_id)
        assert conversation.admin_unread_count == 2 and conversation.last_message_at >= original_activity
        assert await db.scalar(select(func.count()).select_from(SupportConversation).where(SupportConversation.user_id == user.id)) == 1
        assert await db.scalar(select(func.count()).select_from(SupportMessage).where(SupportMessage.conversation_id == conversation.id)) == 2


async def test_user_conversation_fetch_is_implicitly_owner_scoped(support_db):
    sessions, user, other, _ = support_db
    async with sessions() as db: own = await _send_user_message(db, user, "Private A", uuid.uuid4())
    async with sessions() as db: foreign = await _send_user_message(db, other, "Private B", uuid.uuid4())
    async with sessions() as db:
        result = await get_conversation(user, db, None, 50)
        assert result.id == own.conversation_id and {m.conversation_id for m in result.messages} == {own.conversation_id}
        assert foreign.conversation_id != result.id and "Private B" not in {m.body for m in result.messages}


async def test_user_and_admin_idempotency(support_db):
    sessions, user, _, admin = support_db; user_key = uuid.uuid4(); admin_key = uuid.uuid4()
    async with sessions() as db:
        one = await _send_user_message(db, user, "Retry me", user_key)
    async with sessions() as db:
        two = await _send_user_message(db, user, "Retry me", user_key)
        assert two.id == one.id
        await reply_support_conversation(one.conversation_id, SupportMessageCreate(message="Reply", client_message_id=admin_key), admin, db)
    async with sessions() as db:
        duplicate = await reply_support_conversation(one.conversation_id, SupportMessageCreate(message="Reply", client_message_id=admin_key), admin, db)
        assert await db.scalar(select(func.count()).select_from(SupportMessage).where(SupportMessage.conversation_id == one.conversation_id)) == 2
        assert duplicate.client_message_id == admin_key
        conversation = await db.get(SupportConversation, one.conversation_id)
        assert conversation.admin_unread_count == 1 and conversation.user_unread_count == 1


async def test_read_state_is_persisted_and_recoverable_from_messages(support_db):
    sessions, user, _, admin = support_db
    async with sessions() as db: message = await _send_user_message(db, user, "One", uuid.uuid4())
    async with sessions() as db: await _send_user_message(db, user, "Two", uuid.uuid4())
    async with sessions() as db:
        detail = await get_support_conversation(message.conversation_id, admin, db, None, 50)
        assert detail.admin_unread_count == 0
    async with sessions() as db:
        conversation = await db.get(SupportConversation, message.conversation_id)
        unread_users = await db.scalar(select(func.count()).select_from(SupportMessage).where(SupportMessage.conversation_id == message.conversation_id, SupportMessage.sender_type == SupportSenderType.user, SupportMessage.admin_read_at.is_(None)))
        assert conversation.admin_unread_count == unread_users == 0
        await reply_support_conversation(message.conversation_id, SupportMessageCreate(message="A", client_message_id=uuid.uuid4()), admin, db)
    async with sessions() as db: await reply_support_conversation(message.conversation_id, SupportMessageCreate(message="B", client_message_id=uuid.uuid4()), admin, db)
    async with sessions() as db:
        assert (await db.get(SupportConversation, message.conversation_id)).user_unread_count == 2
        await get_conversation(user, db, None, 50)
    async with sessions() as db:
        conversation = await db.get(SupportConversation, message.conversation_id)
        unread_admin = await db.scalar(select(func.count()).select_from(SupportMessage).where(SupportMessage.conversation_id == message.conversation_id, SupportMessage.sender_type == SupportSenderType.admin, SupportMessage.user_read_at.is_(None)))
        assert conversation.user_unread_count == unread_admin == 0


async def test_resolution_reopen_and_user_auto_reopen(support_db):
    sessions, user, _, admin = support_db
    async with sessions() as db: message = await _send_user_message(db, user, "Issue", uuid.uuid4())
    async with sessions() as db: await resolve_support_conversation(message.conversation_id, _request(), admin, db)
    async with sessions() as db:
        conversation = await db.get(SupportConversation, message.conversation_id)
        assert conversation.status == SupportConversationStatus.resolved and conversation.resolved_at and conversation.resolved_by_admin_id == admin.id
        await reopen_support_conversation(message.conversation_id, _request(), admin, db)
    async with sessions() as db:
        conversation = await db.get(SupportConversation, message.conversation_id)
        assert conversation.status == SupportConversationStatus.open and conversation.resolved_at is None and conversation.resolved_by_admin_id is None
        await resolve_support_conversation(message.conversation_id, _request(), admin, db)
    async with sessions() as db: reopened = await _send_user_message(db, user, "Still broken", uuid.uuid4())
    async with sessions() as db:
        conversation = await db.get(SupportConversation, message.conversation_id)
        assert reopened.conversation_id == message.conversation_id and conversation.status == SupportConversationStatus.open
        assert conversation.resolved_at is None and conversation.resolved_by_admin_id is None and conversation.admin_unread_count == 2


async def test_legacy_post_retains_audit_row_and_creates_chat_message(support_db):
    sessions, user, _, _ = support_db
    async with sessions() as db: legacy = await create_feedback(FeedbackCreate(content="Old client", category="Bug Report"), user, db)
    async with sessions() as db:
        conversation = await db.scalar(select(SupportConversation).where(SupportConversation.user_id == user.id))
        message = await db.scalar(select(SupportMessage).where(SupportMessage.conversation_id == conversation.id))
        assert legacy.content == message.body == "Old client" and conversation.admin_unread_count == 1
        assert message.category == SupportCategory.bug_report
        assert await db.get(Feedback, legacy.id) is not None


async def test_message_and_inbox_pagination_filters_search_and_sort(support_db):
    sessions, user, other, admin = support_db
    async with sessions() as db:
        first = await _send_user_message(db, user, "seed", uuid.uuid4())
    base = first.created_at
    async with sessions() as db:
        conversation = await db.get(SupportConversation, first.conversation_id)
        for index in range(1, 56):
            db.add(SupportMessage(conversation_id=conversation.id, sender_type=SupportSenderType.user, sender_user_id=user.id, body=f"m{index:02}", client_message_id=uuid.uuid4(), created_at=base + timedelta(microseconds=1)))
        conversation.admin_unread_count = 56; conversation.last_message_at = base + timedelta(microseconds=1); conversation.last_user_message_at = conversation.last_message_at; await db.commit()
    async with sessions() as db: newest = await get_conversation(user, db, None, 50)
    assert len(newest.messages) == 50 and newest.next_cursor is not None
    async with sessions() as db: older = await get_conversation(user, db, newest.next_cursor, 50)
    assert not ({m.id for m in newest.messages} & {m.id for m in older.messages}) and len(newest.messages) + len(older.messages) == 56
    async with sessions() as db: other_message = await _send_user_message(db, other, "Other newest", uuid.uuid4())
    async with sessions() as db: await get_support_conversation(other_message.conversation_id, admin, db, None, 50)
    async with sessions() as db:
        all_rows = await list_support_conversations(admin, db, "all", "", 1, 30)
        unread = await list_support_conversations(admin, db, "unread", "CASEY", 1, 30)
        read = await list_support_conversations(admin, db, "read", "jordan", 1, 30)
        assert all_rows.items[0].id == other_message.conversation_id
        assert [x.id for x in unread.items] == [first.conversation_id]
        assert [x.id for x in read.items] == [other_message.conversation_id]
        assert (await list_support_conversations(admin, db, "all", "missing", 1, 30)).total == 0
        page_one = await list_support_conversations(admin, db, "all", "", 1, 1)
        page_two = await list_support_conversations(admin, db, "all", "", 2, 1)
        assert page_one.total == page_two.total == 2 and page_one.items[0].id != page_two.items[0].id
        await resolve_support_conversation(other_message.conversation_id, _request(), admin, db)
        resolved = await list_support_conversations(admin, db, "resolved", "jordan", 1, 30)
        no_longer_read = await list_support_conversations(admin, db, "read", "jordan", 1, 30)
        assert [x.id for x in resolved.items] == [other_message.conversation_id] and no_longer_read.total == 0


async def test_first_message_race_and_concurrent_duplicate_retry(support_db):
    sessions, user, _, _ = support_db
    async def send(body, key):
        async with sessions() as db: return await _send_user_message(db, user, body, key)
    distinct = await asyncio.gather(send("race one", uuid.uuid4()), send("race two", uuid.uuid4()))
    duplicate_key = uuid.uuid4(); duplicates = await asyncio.gather(send("same", duplicate_key), send("same", duplicate_key))
    async with sessions() as db:
        assert len({m.conversation_id for m in distinct + duplicates}) == 1
        assert len({m.id for m in duplicates}) == 1
        conversation_id = distinct[0].conversation_id
        assert await db.scalar(select(func.count()).select_from(SupportConversation).where(SupportConversation.user_id == user.id)) == 1
        assert await db.scalar(select(func.count()).select_from(SupportMessage).where(SupportMessage.conversation_id == conversation_id)) == 3
        assert (await db.get(SupportConversation, conversation_id)).admin_unread_count == 3


async def test_sender_integrity_failure_rolls_back_conversation_atomically(support_db):
    sessions, user, _, admin = support_db
    conversation_id = uuid.uuid4()
    async with sessions() as db:
        conversation = SupportConversation(id=conversation_id, user_id=user.id, last_message_at=datetime.now(UTC))
        invalid = SupportMessage(conversation_id=conversation_id, sender_type=SupportSenderType.user,
            sender_user_id=user.id, sender_admin_id=admin.id, body="invalid", client_message_id=uuid.uuid4())
        db.add_all([conversation, invalid])
        with pytest.raises(IntegrityError): await db.commit()
        await db.rollback()
    async with sessions() as db:
        assert await db.get(SupportConversation, conversation_id) is None


async def test_simultaneous_user_admin_messages_and_reads_are_serialized(support_db):
    sessions, user, _, admin = support_db
    async with sessions() as db: seed = await _send_user_message(db, user, "seed", uuid.uuid4())
    async def user_send():
        async with sessions() as db: return await _send_user_message(db, user, "user concurrent", uuid.uuid4())
    async def admin_send():
        async with sessions() as db: return await reply_support_conversation(seed.conversation_id, SupportMessageCreate(message="admin concurrent", client_message_id=uuid.uuid4()), admin, db)
    await asyncio.gather(user_send(), admin_send())
    async def admin_read():
        async with sessions() as db: return await get_support_conversation(seed.conversation_id, admin, db, None, 50)
    await asyncio.gather(admin_read(), admin_read())
    async with sessions() as db:
        conversation = await db.get(SupportConversation, seed.conversation_id)
        bodies = set((await db.scalars(select(SupportMessage.body).where(SupportMessage.conversation_id == seed.conversation_id))).all())
        assert {"seed", "user concurrent", "admin concurrent"} == bodies
        assert conversation.admin_unread_count == 0 and conversation.user_unread_count == 1


async def test_categories_first_followup_and_new_issue_after_resolution(support_db):
    sessions, user, _, admin = support_db
    async with sessions() as db:
        first = await _send_user_message(db, user, "Quiz crashes", uuid.uuid4(), SupportCategory.bug_report, require_initial_category=True)
        assert first.category == SupportCategory.bug_report
    async with sessions() as db:
        followup = await _send_user_message(db, user, "More detail", uuid.uuid4(), None, require_initial_category=True)
        assert followup.category is None
        await resolve_support_conversation(first.conversation_id, _request(), admin, db)
    async with sessions() as db:
        new_issue = await _send_user_message(db, user, "Please add folders", uuid.uuid4(), SupportCategory.feature_request, require_initial_category=True)
        conversation = await db.get(SupportConversation, first.conversation_id)
        assert new_issue.category == SupportCategory.feature_request and conversation.status == SupportConversationStatus.open


async def test_first_new_chat_requires_category(support_db):
    sessions, user, _, _ = support_db
    async with sessions() as db:
        with pytest.raises(HTTPException) as error:
            await _send_user_message(db, user, "No category", uuid.uuid4(), None, require_initial_category=True)
        assert error.value.status_code == 422
        await db.rollback()
    async with sessions() as db:
        assert await db.scalar(select(func.count()).select_from(SupportConversation).where(SupportConversation.user_id == user.id)) == 0


async def test_dashboard_aggregates_and_combined_category_filters(support_db):
    sessions, user, other, admin = support_db
    async with sessions() as db: bug = await _send_user_message(db, user, "Bug", uuid.uuid4(), SupportCategory.bug_report)
    async with sessions() as db: feature = await _send_user_message(db, other, "Feature", uuid.uuid4(), SupportCategory.feature_request)
    async with sessions() as db:
        await get_support_conversation(feature.conversation_id, admin, db, None, 50)
        await resolve_support_conversation(feature.conversation_id, _request(), admin, db)
    async with sessions() as db:
        summary = await support_dashboard(admin, db, "7d")
        assert (summary.open_conversations, summary.unread_conversations, summary.resolved_conversations, summary.new_conversations) == (1, 1, 1, 2)
        assert {row.category: row.count for row in summary.categories} == {SupportCategory.bug_report: 1}
        unread_bugs = await list_support_conversations(admin, db, "unread", "", 1, 30, SupportCategory.bug_report)
        resolved_features = await list_support_conversations(admin, db, "resolved", "", 1, 30, SupportCategory.feature_request)
        assert [row.id for row in unread_bugs.items] == [bug.conversation_id]
        assert [row.id for row in resolved_features.items] == [feature.conversation_id]


async def test_dashboard_empty_state_is_all_zero(support_db):
    sessions, _, _, admin = support_db
    async with sessions() as db:
        summary = await support_dashboard(admin, db, "30d")
        assert (summary.open_conversations, summary.unread_conversations, summary.resolved_conversations, summary.new_conversations) == (0, 0, 0, 0)
        assert summary.categories == [] and summary.recent_activity == []
