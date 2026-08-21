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

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.plan import Plan
from models.user import User
from models.user_subscription import UserSubscription
import services.credits as credits
from services.usage_events import (
    BOOK_UPLOADED,
    FLASHCARDS_GENERATED,
    consumed_quantity,
    current_period_start,
)


class Action(Enum):
    REGENERATE = "regenerate"
    CREATE_BOOK = "create_book"
    CREATE_SET = "create_set"
    START_GAME = "start_game"
    SEND_CHALLENGE = "send_challenge"
    CREATE_STUDY_GROUP = "create_study_group"
    JOIN_STUDY_GROUP = "join_study_group"
    PRIORITY_PROCESSING = "priority_processing"
    DAILY_REVIEW = "daily_review"
    ACTIVATE_SHARED_CONTENT = "activate_shared_content"


async def _user_plan_slug(db: AsyncSession, user: User) -> str:
    # Prefer the latest internal subscription row. Once subscription history is
    # known locally, never fall back to a potentially stale denormalized tier.
    now = datetime.now(timezone.utc)
    sub = await db.scalar(
        select(UserSubscription)
        .where(
            UserSubscription.user_id == user.id,
        )
        .order_by(UserSubscription.current_period_end.desc().nullslast(), UserSubscription.created_at.desc())
        .limit(1)
    )
    if isinstance(sub, UserSubscription):
        paid_through = sub.current_period_end is not None and sub.current_period_end > now
        access_status = sub.status in ("active", "trialing", "past_due", "canceled")
        if paid_through and access_status:
            plan = await db.get(Plan, sub.plan_id)
            if isinstance(plan, Plan) and isinstance(plan.slug, str) and plan.slug:
                return str(plan.slug)
        return "free"

    # The denormalized User.subscription_tier is display/compatibility data only.
    # Absence of a canonical subscription row is free access, even if that field
    # is stale and still says "student" or "premium".
    return "free"


# Default feature map used when Plan rows do not express flags. These
# are intentionally conservative; Plan table can override in the future.
DEFAULT_PLAN_FEATURES = {
    "free": {
        "max_books": 1,
        "max_sets": 1,
        "max_cards_per_set": 5,
        "games_limit": 2,
        "daily_review_limit": 5,
        "can_send_challenges": False,
        "can_create_study_group": False,
        "max_joined_study_groups": 1,
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
        "max_joined_study_groups": None,
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
        "max_joined_study_groups": None,
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
        "max_joined_study_groups": None,
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
    for key in ("max_books", "max_sets", "max_cards_per_set", "games_limit", "daily_review_limit", "can_send_challenges", "can_create_study_group", "max_joined_study_groups", "priority_processing", "games_allowed"):
        if hasattr(p, key):
            val = getattr(p, key)
            # Only accept simple scalar values from DB model fields; avoid accepting
            # awaitables/AsyncMock objects from tests.
            if isinstance(val, (int, bool, str)):
                features[key] = val
    return features


async def can_user_do(db: AsyncSession, user: User, action: Action, **kwargs: Any) -> dict:
    """Return entitlement decision and metadata for the caller to act on.

    For `REGENERATE`: regenerating a scenario always costs a purchased extra
    credit, on every plan (including premium_30) — there is no monthly/free
    allowance for it. Allowed only if the user holds >=1 purchased regen credit.
    """
    if action == Action.REGENERATE:
        # set_id may be passed in kwargs but not required here
        _monthly, purchased = await credits._split_pool_balances(db, user.id, pool="regen")

        if purchased >= 1:
            return {"allowed": True, "reason": "purchased_regen", "consume": {"pool": "regen", "amount": 1}}
        return {"allowed": False, "reason": "no_regen"}

    # Other actions: implement specific checks
    plan_slug = await _user_plan_slug(db, user)
    features = await _plan_features(db, plan_slug)

    # Content credits (monthly plan allowance, then shared purchased credits) are the real
    # gate for creating/activating books and flashcard sets — see credits.consume_credits,
    # which spends monthly content credits first and falls back to purchased credits once
    # the monthly allowance is exhausted. usage_events (consumed_quantity/record_usage)
    # remains the append-only audit/idempotency ledger for reporting, but it must never be
    # the thing that blocks a user who still holds purchased credits: running out of the
    # included monthly allowance is not a hard wall as long as they can afford it.
    #
    # Downgrading to a lower monthly_content_allowance never removes or locks a user's
    # existing content — it only affects the size of the next monthly grant. A user who
    # spent all of a higher plan's credits this period keeps everything they already made
    # and can still study/edit/delete it; they just draw on purchased credits (or wait for
    # the next grant) to make anything new. Surfaced ahead of time via the downgrade notice
    # in GET /billing/subscription/preview-change (routers/billing.py).
    if action == Action.CREATE_BOOK:
        balance = await credits.get_user_balance(db, user.id, pool="content")
        if balance < 1:
            return {"allowed": False, "reason": "book_limit"}
        return {"allowed": True, "consume": {"pool": "content", "amount": 1}}

    if action == Action.CREATE_SET:
        balance = await credits.get_user_balance(db, user.id, pool="content")
        if balance < 1:
            return {"allowed": False, "reason": "set_limit"}
        return {"allowed": True, "consume": {"pool": "content", "amount": 1}}

    if action == Action.ACTIVATE_SHARED_CONTENT:
        # Activating shared content spends the recipient's own content credits — the same
        # 2 credits (1 book-equivalent + 1 set-equivalent) it would cost to upload the book
        # and generate the set themselves, consumed in the same monthly-then-purchased order.
        # The caller (routers/study_groups.py) both spends the credits and records usage in
        # the append-only UsageEvent ledger on success; deactivating never refunds either —
        # same as deleting an owned book/set never does.
        balance = await credits.get_user_balance(db, user.id, pool="content")
        if balance < 2:
            return {"allowed": False, "reason": "content_credits_exhausted"}
        return {"allowed": True, "consume": {"pool": "content", "amount": 2}}

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

    if action == Action.JOIN_STUDY_GROUP:
        limit = features.get("max_joined_study_groups")
        if limit is None:
            return {"allowed": True}
        count = int(kwargs.get("count", 0))
        if count < int(limit):
            return {"allowed": True}
        return {"allowed": False, "reason": "study_group_join_limit_reached", "limit": limit}

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
