"""Idempotent seeding of subscription `Plan` rows.

Usage: run from `services/api` with the environment configured and DB initialized.
"""
from __future__ import annotations

import asyncio
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import database
from models.plan import Plan
from models.user import User
from services.credits import award_monthly_allowance_for_user
from config import settings


PLANS = [
    {
        "slug": "free",
        "name": "Free",
        "monthly_content_allowance": 2,
        "monthly_regen_allowance": 0,
        # price_ids are pulled from settings which already contains embedded IDs
    },
    {
        "slug": "quick_72",
        "name": "Quick 7",
        "monthly_content_allowance": 7,
        "monthly_regen_allowance": 0,
    },
    {
        "slug": "standard_15",
        "name": "Standard 15",
        "monthly_content_allowance": 15,
        "monthly_regen_allowance": 0,
    },
    {
        "slug": "premium_30",
        "name": "Premium 30",
        "monthly_content_allowance": 30,
        # Regeneration always costs a purchased extra credit on every plan, including
        # premium_30 -- see the entitlements.py Action.REGENERATE docstring. A nonzero
        # value here silently reintroduces a free regenerate: consume_credits() spends
        # the monthly pool before the purchased one, so a user who has ever bought a
        # single regen credit would pass the purchased-balance gate check forever while
        # every regenerate is actually paid for by this "free" monthly grant.
        "monthly_regen_allowance": 0,
    },
]


async def run() -> None:
    database.init_engine(settings.DATABASE_URL)
    if database.AsyncSessionLocal is None:
        raise RuntimeError("Database session factory was not initialized")
    async with database.AsyncSessionLocal() as db:
        for p in PLANS:
            q = await db.scalar(select(Plan).where(Plan.slug == p["slug"]))
            if q is None:
                plan = Plan(
                    id=uuid.uuid4(),
                    name=p["name"],
                    slug=p["slug"],
                    monthly_content_allowance=p["monthly_content_allowance"],
                    monthly_regen_allowance=p["monthly_regen_allowance"],
                    # Map known environment names -> fall back to empty mapping.
                    price_ids={
                        "price_id": getattr(
                            settings, f"STRIPE_PRICE_ID_{p['slug'].upper()}", None
                        )
                    }
                )
                db.add(plan)
            else:
                # idempotent update if allowances differ
                changed = False
                if q.monthly_content_allowance != p["monthly_content_allowance"]:
                    q.monthly_content_allowance = p["monthly_content_allowance"]
                    changed = True
                if q.monthly_regen_allowance != p["monthly_regen_allowance"]:
                    q.monthly_regen_allowance = p["monthly_regen_allowance"]
                    changed = True
                if changed:
                    db.add(q)

        await db.commit()


if __name__ == "__main__":
    asyncio.run(run())
