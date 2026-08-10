"""Monthly refill job for awarding plan allowances.

Callable by scheduler/cron. Skips `free` plan and skips zero-value allowances.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import AsyncSessionLocal, init_engine
from config import settings
from models.user_subscription import UserSubscription
from models.plan import Plan
import services.credits as credits


async def award_for_all_subscriptions() -> None:
    """Iterate active subscriptions and award monthly allowances.

    This callable is intentionally simple; scheduling (cron) is configured elsewhere.
    It will skip any plan with zero allowances and skips plan.slug == 'free'.
    """
    init_engine(settings.DATABASE_URL)
    async with AsyncSessionLocal() as db:  # type: ignore
        r = await db.execute(select(UserSubscription).where(UserSubscription.status == "active"))
        subs = r.scalars().all()
        for s in subs:
            plan = await db.get(Plan, s.plan_id)
            if plan is None:
                continue
            if plan.slug == "free":
                continue
            # skip zero allowances
            if (not plan.monthly_content_allowance) and (not plan.monthly_regen_allowance):
                continue
            await credits.award_monthly_allowance_for_user(db, s.user_id, plan.id)
        await db.commit()
