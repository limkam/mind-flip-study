import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("credit checkout opens a new tab before awaiting the checkout URL", () => {
  const source = readFileSync(
    new URL("../../src/lib/billing.js", import.meta.url),
    "utf8",
  );
  const start = source.indexOf("export async function startCreditCheckout");
  const end = source.indexOf("export async function verifyCheckoutSession", start);
  const implementation = source.slice(start, end);

  const openIndex = implementation.indexOf('window.open("", "_blank")');
  const awaitIndex = implementation.indexOf("await client.post");

  assert.ok(openIndex >= 0, "a new tab should be opened");
  assert.ok(openIndex < awaitIndex, "the tab must open before the API request");
  assert.match(
    implementation,
    /checkoutTab\.location\.replace\(data\.checkout_url\)/,
  );
  assert.doesNotMatch(implementation, /window\.location\.assign\(/);
});
