import test from "node:test";
import assert from "node:assert/strict";
import { classifyCheckoutVerification, isValidCheckoutSessionId } from "../../src/lib/checkoutVerification.js";

test("manual or malformed checkout URLs cannot be treated as valid", () => {
  assert.equal(isValidCheckoutSessionId(""), false);
  assert.equal(isValidCheckoutSessionId("invalid"), false);
  assert.equal(isValidCheckoutSessionId("cs_valid_123"), true);
});

test("subscription success requires server-confirmed active state", () => {
  assert.equal(classifyCheckoutVerification({ checkout_kind: "subscription", checkout_status: "complete", subscription_state: "active" }, "subscription"), "success");
  assert.equal(classifyCheckoutVerification({ checkout_kind: "subscription", checkout_status: "complete", subscription_state: "processing" }, "subscription"), "processing");
  assert.equal(classifyCheckoutVerification({ checkout_kind: "subscription", checkout_status: "open", subscription_state: "not_confirmed" }, "subscription"), "error");
});

test("credit success requires the completed CreditPurchase projection", () => {
  assert.equal(classifyCheckoutVerification({ checkout_kind: "credit_purchase", checkout_status: "complete", purchase_state: "credited" }, "credit_purchase"), "success");
  assert.equal(classifyCheckoutVerification({ checkout_kind: "credit_purchase", checkout_status: "complete", purchase_state: "processing" }, "credit_purchase"), "processing");
  assert.equal(classifyCheckoutVerification({ checkout_kind: "credit_purchase", checkout_status: "complete", purchase_state: "not_confirmed" }, "credit_purchase"), "error");
  assert.equal(classifyCheckoutVerification({ checkout_kind: "subscription", checkout_status: "complete", subscription_state: "active" }, "credit_purchase"), "error");
});
