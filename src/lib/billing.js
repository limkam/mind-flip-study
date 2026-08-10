import client from "@/api/client";
import { planLabelFromTier } from "@/lib/plans";

/** Set VITE_SUBSCRIPTIONS_ENABLED=true to show upgrade UI (profile + header banner). */
export function subscriptionsEnabled() {
  return import.meta.env.VITE_SUBSCRIPTIONS_ENABLED === "true";
}

export function isFreeTier(subscriptionTier) {
  return !subscriptionTier || subscriptionTier === "free";
}

export function subscriptionLabel(subscriptionTier) {
  return planLabelFromTier(subscriptionTier);
}

/** @param {'quick' | 'standard' | 'premium' | 'basic'} plan */
export async function startCheckout(plan = "standard", interval = "monthly") {
  const { data } = await client.post("/billing/checkout", null, {
    params: { plan, interval },
  });
  if (!data?.checkout_url) {
    throw new Error("Stripe did not return a checkout URL");
  }
  window.open(data.checkout_url, "_blank", "noopener,noreferrer");
}

export async function startTrialCheckout() {
  const { data } = await client.post("/billing/trial/start");
  if (!data?.checkout_url) {
    throw new Error("Stripe did not return a checkout URL");
  }
  window.open(data.checkout_url, "_blank", "noopener,noreferrer");
}

export async function fetchTrialEligibility() {
  const { data } = await client.get("/billing/trial/eligibility");
  return data;
}

export async function cancelSubscriptionAtPeriodEnd() {
  const { data } = await client.post("/billing/subscription/cancel");
  return data;
}

export async function syncSubscriptionFromStripe() {
  const { data } = await client.post("/billing/subscription/sync");
  return data;
}

export async function fetchEntitlementsSnapshot() {
  const { data } = await client.get("/billing/entitlements/me");
  return data;
}

export async function fetchBillingOverview() {
  const { data } = await client.get("/billing/overview");
  return data;
}

export async function openCustomerPortal() {
  const { data } = await client.post("/billing/customer-portal");
  if (!data?.checkout_url) throw new Error("Stripe did not return a portal URL");
  window.open(data.checkout_url, "_blank", "noopener,noreferrer");
}

export async function fetchBillingPricing() {
  const { data } = await client.get("/billing/pricing");
  return data;
}

export async function startCreditCheckout(quantity) {
  const { data } = await client.post("/billing/checkout/credits", null, {
    params: { quantity: Number(quantity) },
  });
  if (!data?.checkout_url) {
    throw new Error("Stripe did not return a checkout URL");
  }
  window.open(data.checkout_url, "_blank", "noopener,noreferrer");
}

export async function fetchCreditPricing() {
  const { data } = await client.get("/credits/pricing");
  return data?.pricing || null;
}

export async function fetchCreditUsage() {
  const { data } = await client.get("/credits/usage");
  return data;
}

export async function fetchCreditPurchaseHistory() {
  const { data } = await client.get("/credits/purchase-history");
  return data;
}

export function isUpgradeRequiredError(err) {
  const detail = err?.response?.data?.detail;
  return detail?.code === "UPGRADE_REQUIRED";
}

export function getUpgradeRequiredMessage(
  err,
  fallback = "Upgrade to unlock this feature.",
) {
  const detail = err?.response?.data?.detail;
  if (
    detail &&
    typeof detail === "object" &&
    typeof detail.message === "string"
  ) {
    return detail.message;
  }
  return fallback;
}

export function getUpgradeHook(err) {
  const detail = err?.response?.data?.detail;
  if (detail && typeof detail === "object" && detail.upgrade_hook) {
    return detail.upgrade_hook;
  }
  return null;
}
