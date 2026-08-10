"""Entitlement checks for user actions.

Single source of truth: `can_user_do(db, user, action, **kwargs)` returns a dict:
  {allowed: bool, reason: str | None, upgrade_hook: dict | None, consume: dict | None}

`consume` indicates how the caller should perform credit burns (pool, amount).
"""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any
from uuid import UUID

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from models.plan import Plan
from models.user import User
from models.book import Book
from models.flashcard import FlashcardSet
from models.user_subscription import UserSubscription
import services.credits as credits


class Action(Enum):
    REGENERATE = "regenerate"
    CREATE_BOOK = "create_book"
    CREATE_SET = "create_set"
    START_GAME = "start_game"
    SEND_CHALLENGE = "send_challenge"
    CREATE_STUDY_GROUP = "create_study_group"
    PRIORITY_PROCESSING = "priority_processing"
    DAILY_REVIEW = "daily_review"


async def _user_plan_slug(db: AsyncSession, user: User) -> str:
    # Prefer internal subscription rows if present and still paid-through.
    now = datetime.now(timezone.utc)
    sub = await db.scalar(
        select(UserSubscription)
        .where(
            UserSubscription.user_id == user.id,
            UserSubscription.current_period_end.is_not(None),
            UserSubscription.current_period_end > now,
            UserSubscription.status.in_(("active", "trialing", "past_due", "canceled")),
        )
        .order_by(UserSubscription.current_period_end.desc())
        .limit(1)
    )
    if isinstance(sub, UserSubscription):
        plan = await db.get(Plan, sub.plan_id)
        if isinstance(plan, Plan) and isinstance(plan.slug, str) and plan.slug:
            return str(plan.slug)

    # Fallback to user's denormalized tier mapping.
    tier = (user.subscription_tier or "").lower()
    # Map legacy tiers to plan slugs
    if tier in ("free", "free_tier"):
        return "free"
    if tier in ("quick", "quick_7", "quick_72"):
        return "quick_72"
    if tier in ("premium", "premium_30"):
        return "premium_30"
    if tier in ("standard", "student", "standard_15"):
        return "standard_15"
    # default to free
    return "free"


# Default feature map used when Plan rows do not express flags. These
# are intentionally conservative; Plan table can override in the future.
DEFAULT_PLAN_FEATURES = {
    "free": {
        "max_books": 1,
        "max_sets": 1,
        "max_cards_per_set": 5,
        "games_limit": 2,
        "daily_review_limit": 20,
        "can_send_challenges": False,
        "can_create_study_group": False,
        "can_join_study_group": True,
        "priority_processing": False,
        "games_allowed": True,
    },
    "quick_72": {
        "max_books": 2,
        "max_sets": 5,
        "daily_review_limit": None,
        "max_cards_per_set": 20,
        "games_limit": 3,
        "can_send_challenges": False,
        "can_create_study_group": False,
        "can_join_study_group": True,
        "priority_processing": False,
        "games_allowed": True,
    },
    "standard_15": {
        "max_books": 5,
        "max_sets": 10,
        "max_cards_per_set": 30,
        "games_limit": 5,
        "daily_review_limit": None,
        "can_send_challenges": True,
        "can_create_study_group": True,
        "can_join_study_group": True,
        "priority_processing": False,
        "games_allowed": True,
    },
    "premium_30": {
        "max_books": 10,
        "max_sets": 20,
        "max_cards_per_set": 50,
        "games_limit": 8,
        "daily_review_limit": None,
        "can_send_challenges": True,
        "can_create_study_group": True,
        "can_join_study_group": True,
        "priority_processing": True,
        "games_allowed": True,
    },
}


async def _plan_features(db: AsyncSession, plan_slug: str) -> dict:
    # Attempt to load Plan row and read feature flags if present; otherwise fall back
    # to the DEFAULT_PLAN_FEATURES mapping.
    p = await db.scalar(select(Plan).where(Plan.slug == plan_slug))
    if p is None:
        return DEFAULT_PLAN_FEATURES.get(plan_slug, DEFAULT_PLAN_FEATURES["free"])  # type: ignore[index]

    # If Plan row contains explicit attributes, prefer them; otherwise use defaults.
    defaults = DEFAULT_PLAN_FEATURES.get(plan_slug, DEFAULT_PLAN_FEATURES["free"])  # type: ignore[index]
    features: dict = dict(defaults)
    # optional attributes that may be added to Plan later
    for key in ("max_books", "max_sets", "max_cards_per_set", "games_limit", "daily_review_limit", "can_send_challenges", "can_create_study_group", "can_join_study_group", "priority_processing", "games_allowed"):
        if hasattr(p, key):
            val = getattr(p, key)
            # Only accept simple scalar values from DB model fields; avoid accepting
            # awaitables/AsyncMock objects from tests.
            if isinstance(val, (int, bool, str)):
                features[key] = val
    return features


async def can_user_do(db: AsyncSession, user: User, action: Action, **kwargs: Any) -> dict:
    """Return entitlement decision and metadata for the caller to act on.

    For `REGENERATE`:
      - Standard_15: do not allow regen from monthly content allowance; only allow
        if regen purchased credits exist (balance in regen pool > 0). If denied,
        include upgrade_hook {"free_on_premium_30": True}.
      - Premium_30: allow if monthly_regen_allowance > 0 (monthly) or purchased
        regen credits exist; indicate whether to consume from 'regen' pool.
      - Free: similar to Standard unless purchased regen credits exist.
    """
    if action == Action.REGENERATE:
        # set_id may be passed in kwargs but not required here
        # Check regen pool balances
        monthly, purchased = await credits._split_pool_balances(db, user.id, pool="regen")
        total = monthly + purchased
        plan_slug = await _user_plan_slug(db, user)
        features = await _plan_features(db, plan_slug)

        if plan_slug == "standard_15":
            # Standard never gets monthly regen allowance; only allow if purchased credits exist
            if purchased >= 1:
                return {"allowed": True, "reason": "purchased_regen", "consume": {"pool": "regen", "amount": 1}}
            return {"allowed": False, "reason": "no_regen", "upgrade_hook": {"free_on_premium_30": True}}

        if plan_slug == "premium_30":
            # allow if monthly or purchased present; prefer monthly
            if monthly >= 1:
                return {"allowed": True, "reason": "monthly_regen", "consume": {"pool": "regen", "amount": 1, "from": "monthly"}}
            if purchased >= 1:
                return {"allowed": True, "reason": "purchased_regen", "consume": {"pool": "regen", "amount": 1, "from": "purchased"}}
            # no credits
            return {"allowed": False, "reason": "no_regen", "upgrade_hook": {"free_on_premium_30": False}}

        # Free and other tiers: only allow if purchased regen credits exist
        if purchased >= 1:
            return {"allowed": True, "reason": "purchased_regen", "consume": {"pool": "regen", "amount": 1}}
        return {"allowed": False, "reason": "no_regen", "upgrade_hook": {"free_on_premium_30": True}}

    # Other actions: implement specific checks
    plan_slug = await _user_plan_slug(db, user)
    features = await _plan_features(db, plan_slug)

    # Free allowances are lifetime. Paid allowances reset monthly and are
    # counted independently for each user.
    period_start = None
    if plan_slug != "free":
        now = datetime.now(timezone.utc)
        period_start = datetime(now.year, now.month, 1, tzinfo=timezone.utc)

    if action == Action.CREATE_BOOK:
        max_books = features.get("max_books")
        if max_books is not None:
            filters = [Book.user_id == user.id]
            if period_start is not None:
                filters.append(Book.created_at >= period_start)
            n = await db.scalar(select(func.count(Book.id)).where(*filters))
            if int(n or 0) >= int(max_books):
                return {"allowed": False, "reason": "book_limit"}
        return {"allowed": True}

    if action == Action.CREATE_SET:
        max_sets = features.get("max_sets")
        if max_sets is not None:
            filters = [FlashcardSet.user_id == user.id]
            if period_start is not None:
                filters.append(FlashcardSet.created_at >= period_start)
            n = await db.scalar(select(func.count(FlashcardSet.id)).where(*filters))
            if int(n or 0) >= int(max_sets):
                return {"allowed": False, "reason": "set_limit"}
        return {"allowed": True}

    if action == Action.START_GAME:
        if not features.get("games_allowed", True):
            return {"allowed": False, "reason": "games_disabled"}
        return {"allowed": True}

    if action == Action.SEND_CHALLENGE:
        if not features.get("can_send_challenges", True):
            return {"allowed": False, "reason": "challenges_disabled"}
        return {"allowed": True}

    if action == Action.CREATE_STUDY_GROUP:
        if not features.get("can_create_study_group", False):
            return {"allowed": False, "reason": "study_group_create_disabled"}
        return {"allowed": True}

    if action == Action.PRIORITY_PROCESSING:
        if not features.get("priority_processing", False):
            return {"allowed": False, "reason": "priority_not_included"}
        return {"allowed": True}

    if action == Action.DAILY_REVIEW:
        limit = features.get("daily_review_limit")
        if limit is None:
            return {"allowed": True}
        # kwargs may include `count` being requested
        count = int(kwargs.get("count", 0))
        if count <= int(limit):
            return {"allowed": True}
        return {"allowed": False, "reason": "daily_review_limit_exceeded", "limit": limit}

    # default allow
    return {"allowed": True}
