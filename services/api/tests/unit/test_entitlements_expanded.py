import pytest
from unittest.mock import AsyncMock
from fastapi import HTTPException

from services.entitlements import DEFAULT_PLAN_FEATURES, can_user_do, Action
from routers.flashcards import _assert_free_tier_card_headroom


def test_default_plan_features_match_published_matrix():
    assert DEFAULT_PLAN_FEATURES["free"]["max_books"] == 1
    assert DEFAULT_PLAN_FEATURES["free"]["max_sets"] == 1
    assert DEFAULT_PLAN_FEATURES["free"]["max_cards_per_set"] == 5
    assert DEFAULT_PLAN_FEATURES["free"]["games_limit"] == 2
    assert DEFAULT_PLAN_FEATURES["quick_72"]["games_limit"] == 3
    assert DEFAULT_PLAN_FEATURES["standard_15"]["games_limit"] == 5
    assert DEFAULT_PLAN_FEATURES["premium_30"]["games_limit"] == 8
    assert DEFAULT_PLAN_FEATURES["quick_72"]["can_send_challenges"] is True
    assert DEFAULT_PLAN_FEATURES["quick_72"]["can_create_study_group"] is False


class _User:
    def __init__(self, id, subscription_tier):
        self.id = id
        self.subscription_tier = subscription_tier


@pytest.mark.asyncio
async def test_free_book_limit(monkeypatch):
    user = _User("u_free", "free")
    fake_db = AsyncMock()

    # return no plan row; default features apply
    async def fake_scalar(q):
        # simulate 3 existing books
        return 3

    fake_db.scalar.side_effect = fake_scalar

    ent = await can_user_do(fake_db, user, Action.CREATE_BOOK)
    assert ent["allowed"] is False
    assert ent["reason"] == "book_limit"


@pytest.mark.asyncio
async def test_standard_can_start_game(monkeypatch):
    user = _User("u_std", "standard_15")
    fake_db = AsyncMock()
    ent = await can_user_do(fake_db, user, Action.START_GAME)
    assert ent["allowed"] is True


@pytest.mark.asyncio
async def test_premium_priority_allowed(monkeypatch):
    user = _User("u_p", "premium_30")
    fake_db = AsyncMock()
    monkeypatch.setattr("services.entitlements._user_plan_slug", AsyncMock(return_value="premium_30"))
    ent = await can_user_do(fake_db, user, Action.PRIORITY_PROCESSING)
    assert ent["allowed"] is True


@pytest.mark.asyncio
async def test_free_daily_review_limit(monkeypatch):
    user = _User("u_free2", "free")
    fake_db = AsyncMock()
    ent = await can_user_do(fake_db, user, Action.DAILY_REVIEW, count=21)
    assert ent["allowed"] is False
    assert ent["limit"] == 20


@pytest.mark.parametrize(
    ("plan", "books", "sets", "cards", "games", "challenges", "groups"),
    [
        ("free", 1, 1, 5, 2, False, False),
        ("quick_72", 2, 5, 20, 3, True, False),
        ("standard_15", 5, 10, 30, 5, True, True),
        ("premium_30", 10, 20, 50, 8, True, True),
    ],
)
def test_published_plan_matrix(plan, books, sets, cards, games, challenges, groups):
    features = DEFAULT_PLAN_FEATURES[plan]
    assert features["max_books"] == books
    assert features["max_sets"] == sets
    assert features["max_cards_per_set"] == cards
    assert features["games_limit"] == games
    assert features["can_send_challenges"] is challenges
    assert features["can_create_study_group"] is groups
    assert features["can_join_study_group"] is True
    assert features["daily_review_limit"] == (20 if plan == "free" else None)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("plan", "action", "limit"),
    [
        ("free", Action.CREATE_BOOK, 1),
        ("free", Action.CREATE_SET, 1),
        ("quick_72", Action.CREATE_BOOK, 2),
        ("quick_72", Action.CREATE_SET, 5),
        ("standard_15", Action.CREATE_BOOK, 5),
        ("standard_15", Action.CREATE_SET, 10),
        ("premium_30", Action.CREATE_BOOK, 10),
        ("premium_30", Action.CREATE_SET, 20),
    ],
)
async def test_resource_allowances_are_per_user(plan, action, limit, monkeypatch):
    user = _User(f"user-{plan}", plan)
    monkeypatch.setattr("services.entitlements._user_plan_slug", AsyncMock(return_value=plan))
    consumed = AsyncMock(return_value=limit - 1)
    monkeypatch.setattr("services.entitlements.consumed_quantity", consumed)

    below_db = AsyncMock()
    allowed = await can_user_do(below_db, user, action)
    assert allowed == {"allowed": True}

    assert consumed.await_args.args[1] == user.id
    period_start = consumed.await_args.kwargs["period_start"]
    if plan == "free":
        assert period_start is None
    else:
        assert period_start is not None

    consumed.reset_mock()
    consumed.return_value = limit
    at_limit_db = AsyncMock()
    denied = await can_user_do(at_limit_db, user, action)
    assert denied["allowed"] is False
    assert denied["reason"] == ("book_limit" if action == Action.CREATE_BOOK else "set_limit")


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("plan", "games", "challenges", "groups", "daily_21"),
    [
        ("free", True, False, False, False),
        ("quick_72", True, True, False, True),
        ("standard_15", True, True, True, True),
        ("premium_30", True, True, True, True),
    ],
)
async def test_feature_actions_match_each_account_plan(monkeypatch, plan, games, challenges, groups, daily_21):
    user = _User(f"feature-user-{plan}", plan)
    features = DEFAULT_PLAN_FEATURES[plan]
    monkeypatch.setattr("services.entitlements._user_plan_slug", AsyncMock(return_value=plan))
    monkeypatch.setattr("services.entitlements._plan_features", AsyncMock(return_value=features))
    db = AsyncMock()

    assert (await can_user_do(db, user, Action.START_GAME))["allowed"] is games
    assert (await can_user_do(db, user, Action.SEND_CHALLENGE))["allowed"] is challenges
    assert (await can_user_do(db, user, Action.CREATE_STUDY_GROUP))["allowed"] is groups
    assert (await can_user_do(db, user, Action.DAILY_REVIEW, count=21))["allowed"] is daily_21


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("plan", "card_limit"),
    [("free", 5), ("quick_72", 20), ("standard_15", 30), ("premium_30", 50)],
)
async def test_card_generation_enforces_each_plan_maximum(monkeypatch, plan, card_limit):
    user = _User(f"card-user-{plan}", plan)
    monkeypatch.setattr("routers.flashcards._user_plan_slug", AsyncMock(return_value=plan))
    monkeypatch.setattr(
        "routers.flashcards._plan_features",
        AsyncMock(return_value=DEFAULT_PLAN_FEATURES[plan]),
    )

    await _assert_free_tier_card_headroom(user, AsyncMock(), card_limit)
    with pytest.raises(HTTPException) as exc_info:
        await _assert_free_tier_card_headroom(user, AsyncMock(), card_limit + 1)
    assert exc_info.value.status_code == 402
    assert exc_info.value.detail["limit"] == card_limit
