"""Group progress must count only reviews of content that's actually in the group — a
member's own material they added, or content they've activated from it — not everything
the member has ever reviewed anywhere in the app."""

from __future__ import annotations

import os
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from models.book import Book
from models.enums import BookStatus, UserRole
from models.flashcard import FlashcardSet
from models.quiz import StudyEvent
from models.study_group import StudyGroup, StudyGroupContentActivation, StudyGroupMaterial, StudyGroupMember
from models.user import User
from routers.study_groups import _cards_this_week


def _book(user_id: uuid.UUID, title: str) -> Book:
    return Book(
        user_id=user_id,
        title=title,
        author="Test Author",
        s3_key=f"books/{uuid.uuid4()}.pdf",
        s3_url="https://example.test/book.pdf",
        file_size_bytes=1024,
        book_code=uuid.uuid4().hex[:12],
        status=BookStatus.ready,
    )


@pytest.mark.asyncio
async def test_cards_this_week_only_counts_reviews_of_this_groups_content() -> None:
    url = os.getenv("ENGAGEMENT_TEST_DATABASE_URL")
    if not url:
        pytest.skip("ENGAGEMENT_TEST_DATABASE_URL is required")
    engine = create_async_engine(url)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with sessions() as db:
        owner = User(
            email=f"group-progress-owner-{uuid.uuid4()}@example.test",
            hashed_password=None,
            role=UserRole.student,
            full_name="Group Owner",
            auth_provider="email",
            preferences={},
            subscription_tier="free",
        )
        member = User(
            email=f"group-progress-member-{uuid.uuid4()}@example.test",
            hashed_password=None,
            role=UserRole.student,
            full_name="Group Member",
            auth_provider="email",
            preferences={},
            subscription_tier="free",
        )
        db.add_all([owner, member])
        await db.flush()

        # Owner's own material, added to the group.
        owner_book = _book(owner.id, "Owner's Shared Book")
        db.add(owner_book)
        await db.flush()
        owner_set = FlashcardSet(user_id=owner.id, book_id=owner_book.id, title="Owner Set", description="", tags=[])

        # Owner's unrelated content, never added to this group.
        outside_book = _book(owner.id, "Owner's Private Book")
        db.add(outside_book)
        await db.flush()
        owner_outside_set = FlashcardSet(user_id=owner.id, book_id=outside_book.id, title="Outside Set", description="", tags=[])

        # Member's own unrelated content, never shared with this group.
        member_outside_book = _book(member.id, "Member's Private Book")
        db.add(member_outside_book)
        await db.flush()
        member_outside_set = FlashcardSet(user_id=member.id, book_id=member_outside_book.id, title="Member Outside Set", description="", tags=[])

        db.add_all([owner_set, owner_outside_set, member_outside_set])
        await db.flush()

        group = StudyGroup(name="Progress Scoping Group", code=uuid.uuid4().hex[:10], privacy="public", weekly_card_goal=20, created_by=owner.id)
        db.add(group)
        await db.flush()
        db.add_all([
            StudyGroupMember(group_id=group.id, user_id=owner.id, role="owner"),
            StudyGroupMember(group_id=group.id, user_id=member.id, role="member"),
        ])
        material = StudyGroupMaterial(group_id=group.id, book_id=owner_book.id, added_by=owner.id)
        db.add(material)
        await db.flush()

        # Member activates the owner's material — this set becomes in-scope for the member too.
        db.add(StudyGroupContentActivation(user_id=member.id, material_id=material.id, book_id=owner_book.id, set_id=owner_set.id))
        await db.flush()

        now = datetime.now(UTC)
        db.add_all([
            # In-scope: owner reviewing their own material that's actually in the group.
            StudyEvent(user_id=owner.id, set_id=owner_set.id, event_type="review", created_at=now),
            # Out of scope: owner reviewing content never added to this group.
            StudyEvent(user_id=owner.id, set_id=owner_outside_set.id, event_type="review", created_at=now),
            # In-scope: member reviewing the material they activated from this group.
            StudyEvent(user_id=member.id, set_id=owner_set.id, event_type="review", created_at=now),
            # Out of scope: member reviewing their own content never shared with this group.
            StudyEvent(user_id=member.id, set_id=member_outside_set.id, event_type="review", created_at=now),
        ])
        await db.commit()

        count = await _cards_this_week(db, group.id, [owner.id, member.id])

        assert count == 2
    await engine.dispose()


@pytest.mark.asyncio
async def test_cards_this_week_excludes_deactivated_activations() -> None:
    url = os.getenv("ENGAGEMENT_TEST_DATABASE_URL")
    if not url:
        pytest.skip("ENGAGEMENT_TEST_DATABASE_URL is required")
    engine = create_async_engine(url)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with sessions() as db:
        owner = User(
            email=f"group-progress-owner2-{uuid.uuid4()}@example.test",
            hashed_password=None,
            role=UserRole.student,
            full_name="Group Owner",
            auth_provider="email",
            preferences={},
            subscription_tier="free",
        )
        member = User(
            email=f"group-progress-member2-{uuid.uuid4()}@example.test",
            hashed_password=None,
            role=UserRole.student,
            full_name="Group Member",
            auth_provider="email",
            preferences={},
            subscription_tier="free",
        )
        db.add_all([owner, member])
        await db.flush()

        owner_book = _book(owner.id, "Owner's Shared Book")
        db.add(owner_book)
        await db.flush()
        owner_set = FlashcardSet(user_id=owner.id, book_id=owner_book.id, title="Owner Set", description="", tags=[])
        db.add(owner_set)
        await db.flush()

        group = StudyGroup(name="Deactivated Scoping Group", code=uuid.uuid4().hex[:10], privacy="public", weekly_card_goal=20, created_by=owner.id)
        db.add(group)
        await db.flush()
        db.add_all([
            StudyGroupMember(group_id=group.id, user_id=owner.id, role="owner"),
            StudyGroupMember(group_id=group.id, user_id=member.id, role="member"),
        ])
        material = StudyGroupMaterial(group_id=group.id, book_id=owner_book.id, added_by=owner.id)
        db.add(material)
        await db.flush()

        # Member activated this material previously but has since deactivated it — the ledger
        # charge is still permanent (see Action.ACTIVATE_SHARED_CONTENT), but it must no longer
        # count toward this group's *progress* stat since it's hidden from their active list.
        db.add(
            StudyGroupContentActivation(
                user_id=member.id, material_id=material.id, book_id=owner_book.id, set_id=owner_set.id,
                deactivated_at=datetime.now(UTC) - timedelta(hours=1),
            ),
        )
        await db.flush()

        db.add(StudyEvent(user_id=member.id, set_id=owner_set.id, event_type="review", created_at=datetime.now(UTC)))
        await db.commit()

        count = await _cards_this_week(db, group.id, [owner.id, member.id])

        assert count == 0
    await engine.dispose()
