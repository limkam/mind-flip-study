#!/usr/bin/env python3
"""Re-derive BillingInvoice.period_start/period_end from Stripe line items.

Historical rows were synced with period_start == period_end (the top-level
Stripe Invoice period, which marks when line items were added to the invoice,
not the billing cycle). This re-fetches each such invoice from Stripe and
recomputes the real period from invoice.lines.data[].period, using the same
_invoice_period() logic as the forward-fix write paths.

Defaults to a dry run (no writes). Pass --apply to write the changes.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import stripe
from sqlalchemy import select

from config import settings
from database import init_engine
from models.billing_analytics import BillingInvoice
from services.stripe_reconciliation import _dict, _invoice_period


def _fmt(dt) -> str:
    return dt.isoformat() if dt else "None"


async def main(apply: bool) -> None:
    if not settings.STRIPE_SECRET_KEY:
        raise RuntimeError("Stripe is not configured")
    stripe.api_key = settings.STRIPE_SECRET_KEY

    init_engine(settings.DATABASE_URL)
    from database import AsyncSessionLocal

    assert AsyncSessionLocal is not None
    async with AsyncSessionLocal() as db:
        rows = (
            await db.scalars(
                select(BillingInvoice).where(
                    BillingInvoice.period_start.is_not(None),
                    BillingInvoice.period_end.is_not(None),
                    BillingInvoice.period_start == BillingInvoice.period_end,
                )
            )
        ).all()

        print(f"{'APPLY' if apply else 'DRY RUN'}: {len(rows)} row(s) with period_start == period_end\n")

        changed = unchanged = skipped = errored = 0
        for row in rows:
            try:
                raw = await asyncio.to_thread(stripe.Invoice.retrieve, row.stripe_invoice_id)
            except stripe.error.InvalidRequestError as exc:
                # Deleted (draft-only) or otherwise no longer resolvable in Stripe.
                print(f"SKIP  {row.stripe_invoice_id} user={row.user_id}: not found in Stripe ({exc.user_message or exc})")
                skipped += 1
                continue
            except Exception as exc:
                print(f"ERROR {row.stripe_invoice_id} user={row.user_id}: {type(exc).__name__}: {exc}")
                errored += 1
                continue

            inv = _dict(raw)
            new_start, new_end = _invoice_period(inv)

            if new_start is None or new_end is None:
                print(
                    f"SKIP  {row.stripe_invoice_id} user={row.user_id}: "
                    f"no usable line-item period on the Stripe invoice (no line items or missing period)"
                )
                skipped += 1
                continue

            if new_start == row.period_start and new_end == row.period_end:
                unchanged += 1
                continue

            print(
                f"{'UPDATE' if apply else 'WOULD UPDATE'} {row.stripe_invoice_id} user={row.user_id} "
                f"paid_at={_fmt(row.paid_at)}\n"
                f"    period_start: {_fmt(row.period_start)} -> {_fmt(new_start)}\n"
                f"    period_end:   {_fmt(row.period_end)} -> {_fmt(new_end)}"
            )
            changed += 1
            if apply:
                row.period_start = new_start
                row.period_end = new_end

        if apply and changed:
            await db.commit()

        print(
            f"\n{'Applied' if apply else 'Would change'}: {changed}  "
            f"Unchanged: {unchanged}  Skipped: {skipped}  Errors: {errored}"
        )
        if not apply:
            print("\nDry run only — no writes made. Re-run with --apply to write these changes.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="Write changes (default: dry run)")
    args = parser.parse_args()
    asyncio.run(main(args.apply))
