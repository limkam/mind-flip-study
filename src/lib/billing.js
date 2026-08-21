import client from "@/api/client";
import { planLabelFromTier } from "@/lib/plans";
import { subscriptionsFeatureEnabled } from "@/lib/billingUiState";

/** Set VITE_SUBSCRIPTIONS_ENABLED=true to show upgrade UI (profile + header banner). */
export function subscriptionsEnabled() {
  return subscriptionsFeatureEnabled(import.meta.env.VITE_SUBSCRIPTIONS_ENABLED);
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

export async function cancelSubscriptionAtPeriodEnd() {
  const { data } = await client.post("/billing/subscription/cancel");
  return data;
}

/** @param {'quick' | 'standard' | 'premium' | 'basic'} plan */
export async function previewSubscriptionChange(plan, interval = "monthly") {
  const { data } = await client.get("/billing/subscription/preview-change", {
    params: { plan, interval },
  });
  return data;
}

/** @param {'quick' | 'standard' | 'premium' | 'basic'} plan */
export async function changeSubscriptionPlan(plan, interval = "monthly") {
  const { data } = await client.post("/billing/subscription/change", null, {
    params: { plan, interval },
  });
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

export async function fetchBillingInvoices() {
  const { data } = await client.get("/billing/invoices");
  return data?.invoices || [];
}

export async function fetchBillingPaymentMethod() {
  const { data } = await client.get("/billing/payment-method");
  return data?.payment_method || null;
}

export async function openCustomerPortal() {
  const { data } = await client.post("/billing/customer-portal");
  if (!data?.checkout_url) throw new Error("Stripe did not return a portal URL");
  window.open(data.checkout_url, "_blank", "noopener,noreferrer");
}

/** Deep-links straight to the Customer Portal's card-update screen. */
export async function openUpdatePaymentMethod() {
  const { data } = await client.post("/billing/customer-portal", null, {
    params: { flow: "payment_method_update" },
  });
  if (!data?.checkout_url) throw new Error("Stripe did not return a portal URL");
  window.open(data.checkout_url, "_blank", "noopener,noreferrer");
}

/** Attempts to pay off a past-due invoice immediately with the current default payment
 * method — called after returning from a payment-method update. */
export async function retryPastDuePayment() {
  const { data } = await client.post("/billing/subscription/retry-payment");
  return data;
}

export async function fetchBillingPricing() {
  const { data } = await client.get("/billing/pricing");
  return data;
}

export async function startCreditCheckout(credits) {
  // Open synchronously while the click is still an active user gesture so the
  // browser does not mistake the Stripe tab for an unsolicited popup.
  const checkoutTab = window.open("", "_blank");
  if (!checkoutTab) {
    throw new Error("Please allow popups to open Stripe Checkout");
  }
  checkoutTab.opener = null;

  try {
    const { data } = await client.post("/billing/checkout/credits", null, {
      params: { credits: Number(credits) },
    });
    if (!data?.checkout_url) {
      throw new Error("Stripe did not return a checkout URL");
    }
    checkoutTab.location.replace(data.checkout_url);
  } catch (error) {
    checkoutTab.close();
    throw error;
  }
}

export async function verifyCheckoutSession(sessionId) {
  if (!/^cs_[a-zA-Z0-9_]{7,252}$/.test(String(sessionId || ""))) {
    throw new Error("Invalid checkout session ID");
  }
  const { data } = await client.get(
    `/billing/checkout/sessions/${encodeURIComponent(sessionId)}`,
  );
  return data;
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
