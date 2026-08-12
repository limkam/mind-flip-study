import test from "node:test";
import assert from "node:assert/strict";

import { billingAccountState, subscriptionsFeatureEnabled } from "../../src/lib/billingUiState.js";

test("confirmed free state exposes upgrade while unresolved states do not", () => {
  const free = { plan_slug: "free", subscription_status: "free" };
  assert.equal(billingAccountState({ data: free }), "free");
  assert.equal(billingAccountState({ data: null, isPending: true }), "loading");
  assert.equal(billingAccountState({ data: null, isError: true }), "error");
  assert.equal(billingAccountState({ data: { plan_slug: "free", subscription_status: "subscription_conflict" } }), "conflict");
  assert.equal(billingAccountState({ data: { plan_slug: "premium_30", subscription_status: "active" } }), "paid");
  assert.equal(billingAccountState({ data: { plan_slug: "free", subscription_status: "canceled" } }), "unknown");
});

test("subscription CTA defaults on and only explicit false disables it", () => {
  assert.equal(subscriptionsFeatureEnabled(undefined), true);
  assert.equal(subscriptionsFeatureEnabled("true"), true);
  assert.equal(subscriptionsFeatureEnabled("false"), false);
});
