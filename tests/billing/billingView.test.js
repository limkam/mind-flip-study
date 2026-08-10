import test from "node:test";
import assert from "node:assert/strict";
import { annualSavings, remainingAllowance, usageLevel, usagePercentage } from "../../src/lib/billingView.js";

test("remaining allowance never becomes negative", () => {
  assert.equal(remainingAllowance(3, 2), 0);
  assert.equal(remainingAllowance(1, 2), 1);
  assert.equal(remainingAllowance(1, null), null);
});

test("usage percentage protects bounds and division by zero", () => {
  assert.equal(usagePercentage(1, 2), 50);
  assert.equal(usagePercentage(20, 2), 100);
  assert.equal(usagePercentage(1, 0), 0);
});

test("usage threshold labels warning, critical, and exhausted states", () => {
  assert.equal(usageLevel(6, 10), "normal");
  assert.equal(usageLevel(7, 10), "warning");
  assert.equal(usageLevel(9, 10), "critical");
  assert.equal(usageLevel(10, 10), "exhausted");
});

test("annual savings use twelve monthly payments as the baseline", () => {
  assert.equal(annualSavings(399, 2400), 2388);
  assert.equal(annualSavings(699, 4200), 4188);
  assert.equal(annualSavings(899, 5400), 5388);
});
