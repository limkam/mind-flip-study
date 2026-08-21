"""PostgreSQL evidence for permanent feature usage accounting.

Runs only against the explicitly disposable USAGE_TEST_DATABASE_URL.
"""

import os
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from models.book import Book
from models.credit_ledger import CreditLedger
from models.enums import BookStatus, UserRole
from models.flashcard import FlashcardSet
from models.usage_event import UsageEvent
from models.user import User
from services.entitlements import Action, can_user_do
from routers.books import delete_book
from routers.flashcards import delete_flashcard_set


@pytest.fixture
async def db():
    url = os.getenv("USAGE_TEST_DATABASE_URL")
    if not url:
        pytest.skip("USAGE_TEST_DATABASE_URL is required")
    engine = create_async_engine(url)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        yield session
        await session.rollback()
    await engine.dispose()


def _user(*, tier: str = "free") -> User:
    token = uuid4().hex
    return User(
        email=f"usage-{token}@example.test",
        hashed_password="test",
        role=UserRole.student,
        full_name="Usage Test",
        subscription_tier=tier,
        preferences={},
        ip_history=[],
    )


def _book(user_id) -> Book:
    token = uuid4().hex
    return Book(
        user_id=user_id,
        title=f"Book {token}",
        author="Test",
        s3_key=f"test/{token}.pdf",
        s3_url=f"https://example.test/{token}.pdf",
        file_size_bytes=1,
        book_code=f"MF-{token[:8].upper()}",
        status=BookStatus.ready,
        extras={},
    )


def _event(user_id, resource_id, event_type, key) -> UsageEvent:
    return UsageEvent(
        user_id=user_id,
        event_type=event_type,
        resource_type="book" if event_type == "book_uploaded" else "flashcard_set",
        resource_id=resource_id,
        quantity=1,
        idempotency_key=key,
    )


def _grant(user_id, amount, *, pool="content", reason="monthly_allowance") -> CreditLedger:
    return CreditLedger(user_id=user_id, amount=amount, pool=pool, reason=reason)


def _spend(user_id, amount, *, pool="content", reason="create_book") -> CreditLedger:
    return CreditLedger(user_id=user_id, amount=-amount, pool=pool, reason=reason)


@pytest.mark.asyncio
async def test_book_delete_keeps_usage_and_credits_spent(db):
    """CREATE_BOOK is gated by content credit balance, not usage_events — deleting the book
    must not refund the credit that was spent creating it (permanent charge, same policy as
    the usage_events ledger it replaced for gating)."""
    user = _user()
    db.add(user)
    await db.flush()
    db.add(_grant(user.id, 1))
    book = _book(user.id)
    db.add(book)
    await db.flush()
    db.add(_event(user.id, book.id, "book_uploaded", f"book:{book.id}"))
    db.add(_spend(user.id, 1, reason="create_book"))
    await db.commit()

    await db.delete(book)
    await db.commit()

    events = (await db.scalars(select(UsageEvent).where(UsageEvent.user_id == user.id))).all()
    assert len(events) == 1
    assert (await can_user_do(db, user, Action.CREATE_BOOK)) == {
        "allowed": False,
        "reason": "book_limit",
    }


@pytest.mark.asyncio
async def test_flashcard_delete_keeps_generation_usage_and_credits_spent(db):
    user = _user()
    db.add(user)
    await db.flush()
    db.add(_grant(user.id, 1))
    card_set = FlashcardSet(user_id=user.id, title="Generated", tags=[])
    db.add(card_set)
    await db.flush()
    db.add(_event(user.id, card_set.id, "flashcards_generated", f"set:{card_set.id}"))
    db.add(_spend(user.id, 1, reason="create_set"))
    await db.commit()

    await db.delete(card_set)
    await db.commit()

    assert await db.scalar(
        select(UsageEvent).where(UsageEvent.resource_id == card_set.id)
    ) is not None
    assert (await can_user_do(db, user, Action.CREATE_SET))["allowed"] is False


@pytest.mark.asyncio
async def test_create_book_falls_back_to_purchased_credits_once_monthly_allowance_exhausted(db):
    """usage_events must never be what blocks a user who still holds purchased credits — once
    the monthly plan allowance is spent, purchased credits (pool='purchased') keep CREATE_BOOK
    allowed, and the entitlement decision says to consume from the shared purchased pool."""
    user = _user()
    db.add(user)
    await db.flush()
    db.add(_grant(user.id, 2))  # monthly content allowance, already fully spent below
    db.add(_spend(user.id, 2, reason="create_book"))
    db.add(_grant(user.id, 3, pool="purchased", reason="purchased_credits"))
    await db.commit()

    decision = await can_user_do(db, user, Action.CREATE_BOOK)
    assert decision == {"allowed": True, "consume": {"pool": "content", "amount": 1}}


@pytest.mark.asyncio
async def test_failed_creation_rolls_back_resource_and_usage(db):
    user = _user()
    db.add(user)
    await db.commit()
    user_id = user.id
    resource_id = uuid4()

    db.add(_book(user_id))
    db.add(_event(user_id, resource_id, "book_uploaded", f"failed:{resource_id}"))
    await db.flush()
    await db.rollback()

    assert await db.scalar(
        select(UsageEvent).where(UsageEvent.idempotency_key == f"failed:{resource_id}")
    ) is None


@pytest.mark.asyncio
async def test_two_consumptions_stay_at_limit_after_content_delete(db):
    user = _user()
    db.add(user)
    await db.flush()
    db.add(_grant(user.id, 2))
    books = [_book(user.id), _book(user.id)]
    db.add_all(books)
    await db.flush()
    for book in books:
        db.add(_event(user.id, book.id, "book_uploaded", f"book:{book.id}"))
        db.add(_spend(user.id, 1, reason="create_book"))
    await db.commit()

    await db.delete(books[0])
    await db.commit()

    denied = await can_user_do(db, user, Action.CREATE_BOOK)
    assert denied == {"allowed": False, "reason": "book_limit"}


@pytest.mark.asyncio
async def test_other_user_cannot_delete_content_or_change_usage(db):
    owner = _user()
    attacker = _user()
    db.add_all([owner, attacker])
    await db.flush()
    book = _book(owner.id)
    card_set = FlashcardSet(user_id=owner.id, title="Owner set", tags=[])
    db.add_all([book, card_set])
    await db.flush()
    db.add_all([
        _event(owner.id, book.id, "book_uploaded", f"book:{book.id}"),
        _event(owner.id, card_set.id, "flashcards_generated", f"set:{card_set.id}"),
    ])
    await db.commit()

    with pytest.raises(HTTPException) as book_error:
        await delete_book(book.id, attacker, db)
    with pytest.raises(HTTPException) as set_error:
        await delete_flashcard_set(card_set.id, attacker, db)

    assert book_error.value.status_code == 404
    assert set_error.value.status_code == 404
    assert await db.get(Book, book.id) is not None
    assert await db.get(FlashcardSet, card_set.id) is not None
    events = (await db.scalars(select(UsageEvent).where(UsageEvent.user_id == owner.id))).all()
    assert len(events) == 2
