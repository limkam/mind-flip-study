"""Guards against reintroducing a free/monthly regenerate allowance.

Regenerating a scenario always costs a purchased extra credit, on every plan
(see services/entitlements.py's Action.REGENERATE docstring). A nonzero
monthly_regen_allowance on any plan silently defeats that: consume_credits()
spends the monthly pool before the purchased one, so a user who has ever
bought a single regen credit passes the purchased-balance gate forever while
every regenerate is actually paid for by the "free" monthly grant instead.
This exact regression shipped once for premium_30 and was only caught by a
live walkthrough -- this test exists so the next occurrence doesn't need one.
"""

from scripts.seed_plans import PLANS


def test_no_plan_grants_a_free_monthly_regenerate():
    offenders = {p["slug"]: p["monthly_regen_allowance"] for p in PLANS if p["monthly_regen_allowance"]}
    assert offenders == {}, (
        f"plan(s) grant a nonzero monthly_regen_allowance, which reintroduces a free "
        f"regenerate once the user holds any purchased regen credit: {offenders}"
    )
