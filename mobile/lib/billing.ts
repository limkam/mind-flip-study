import * as Linking from "expo-linking";

import { api } from "../api/client";
import { useAuthStore } from "../store/authStore";
import type {
  BillingInterval,
  BillingPlanPrice,
  BillingPlanSlug,
  BillingPricingResponse,
  CheckoutVerificationResponse,
  CreditPricingResponse,
  SubscriptionCancelResponse,
  TrialEligibilityReason,
  TrialEligibilityResponse,
  TrialEligibilitySignals,
} from "../types/api";
import { mobileQueryClient } from "./queryClient";

export type EntitlementsSnapshot = {
  plan_slug: string;
  subscription_status: string;
  billing_interval: string | null;
  renewal_or_end_date: string | null;
  balances: {
    monthly_content_credits: number;
    purchased_credits: number;
    monthly_regen_credits: number;
  };
  features: {
    create_book: boolean;
    create_flashcard_set: boolean;
    games: boolean;
    games_limit: number;
    challenges: boolean;
    study_group_creation: boolean;
    priority_processing: boolean;
    daily_review_limit: number | null;
    regeneration: boolean;
  };
  actions: Record<string, {
    allowed: boolean;
    reason: string | null;
    upgrade_hook: Record<string, unknown> | null;
    consume: Record<string, unknown> | null;
  }>;
  raw_plan_features: Record<string, unknown>;
};

export type CreditUsageEntry = {
  id: string;
  amount: number;
  pool: string;
  reason: string;
  created_at: string;
  expires_at?: string | null;
};

export async function fetchEntitlementsSnapshot(): Promise<EntitlementsSnapshot> {
  const { data } = await api.get<EntitlementsSnapshot>("/billing/entitlements/me");
  return data;
}

export async function fetchCreditUsage(): Promise<{ entries: CreditUsageEntry[] }> {
  const { data } = await api.get<{ entries: CreditUsageEntry[] }>("/credits/usage");
  return data;
}

const RECOGNIZED_TRIAL_REASONS: Set<TrialEligibilityReason> = new Set([
  "trial_disabled",
  "already_paid",
  "trial_already_used",
  "subscription_history",
  "payment_history",
]);

export function parseTrialEligibilityResponse(raw: unknown): TrialEligibilityResponse {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Invalid trial eligibility response: expected plain object");
  }
  const obj = raw as Record<string, unknown>;

  if (typeof obj.eligible !== "boolean") {
    throw new Error("Invalid trial eligibility response: eligible must be boolean");
  }
  const eligible = obj.eligible;

  if (!obj.signals || typeof obj.signals !== "object" || Array.isArray(obj.signals)) {
    throw new Error("Invalid trial eligibility response: signals must be a plain object");
  }
  const rawSignals = obj.signals as Record<string, unknown>;
  const signals: TrialEligibilitySignals = {};

  for (const [key, val] of Object.entries(rawSignals)) {
    if (val !== undefined && val !== null && typeof val !== "boolean") {
      throw new Error(`Invalid trial eligibility response: signal ${key} must be boolean`);
    }
  }

  if (typeof rawSignals.trial_enabled === "boolean") signals.trial_enabled = rawSignals.trial_enabled;
  if (typeof rawSignals.trial_used === "boolean") signals.trial_used = rawSignals.trial_used;
  if (typeof rawSignals.has_prior_subscription === "boolean") signals.has_prior_subscription = rawSignals.has_prior_subscription;
  if (typeof rawSignals.has_credit_purchase_history === "boolean") signals.has_credit_purchase_history = rawSignals.has_credit_purchase_history;

  let reason: TrialEligibilityReason | null = null;
  if (obj.reason !== null && obj.reason !== undefined) {
    if (typeof obj.reason === "string" && RECOGNIZED_TRIAL_REASONS.has(obj.reason as TrialEligibilityReason)) {
      reason = obj.reason as TrialEligibilityReason;
    } else {
      throw new Error(`Invalid trial eligibility response: unrecognized reason ${String(obj.reason)}`);
    }
  }

  if (eligible && reason !== null) {
    throw new Error("Inconsistent trial eligibility response: eligible=true cannot have an ineligibility reason");
  }
  if (!eligible && reason === null) {
    throw new Error("Inconsistent trial eligibility response: eligible=false requires an ineligibility reason");
  }

  let trial_days = 7;
  if (obj.trial_days !== undefined && obj.trial_days !== null) {
    if (typeof obj.trial_days === "number" && Number.isInteger(obj.trial_days) && obj.trial_days > 0) {
      trial_days = obj.trial_days;
    } else {
      throw new Error("Invalid trial eligibility response: trial_days must be a positive integer");
    }
  }

  return { eligible, reason, signals, trial_days };
}

export async function fetchTrialEligibility(): Promise<TrialEligibilityResponse> {
  const { data } = await api.get<unknown>("/billing/trial/eligibility");
  return parseTrialEligibilityResponse(data);
}

export const PLAN_ORDER: BillingPlanSlug[] = [
  "free",
  "quick_72",
  "standard_15",
  "premium_30",
];

export const PLAN_LABELS: Record<BillingPlanSlug, string> = {
  free: "Free",
  quick_72: "Quick 7",
  standard_15: "Standard 15",
  premium_30: "Premium 30",
};

export const PLAN_TAGLINES: Record<BillingPlanSlug, string> = {
  free: "Best for trying MindFlip once and exploring the study flow.",
  quick_72: "For light weekly study and faster AI-powered review.",
  standard_15: "For consistent coursework, exam prep, and active group study.",
  premium_30: "For power users who want the highest limits and fastest processing.",
};

const SUBSCRIPTION_LABELS: Record<string, string> = {
  free: "Free",
  student: "Standard 15",
  premium: "Premium 30",
  quick_72: "Quick 7",
  standard_15: "Standard 15",
  premium_30: "Premium 30",
};

/** Set EXPO_PUBLIC_SUBSCRIPTIONS_ENABLED=true to show upgrade UI in profile. */
export function subscriptionsEnabled(): boolean {
  return process.env.EXPO_PUBLIC_SUBSCRIPTIONS_ENABLED === "true";
}

export function isFreeTier(subscriptionTier?: string | null): boolean {
  return !subscriptionTier || subscriptionTier === "free";
}

export function subscriptionLabel(subscriptionTier?: string | null): string {
  return SUBSCRIPTION_LABELS[String(subscriptionTier || "free").toLowerCase()] || "Free";
}

export function checkoutPlanForSlug(slug: BillingPlanSlug): "quick" | "standard" | "premium" | null {
  if (slug === "quick_72") return "quick";
  if (slug === "standard_15") return "standard";
  if (slug === "premium_30") return "premium";
  return null;
}

export function formatUsd(cents: number | null | undefined): string | null {
  if (cents === null || cents === undefined || !Number.isInteger(cents) || cents < 0) {
    return null;
  }
  const dollars = cents / 100;
  if (cents % 100 === 0) {
    return `$${dollars}`;
  }
  return `$${dollars.toFixed(2)}`;
}

export function parseBillingPricingResponse(raw: unknown): BillingPricingResponse {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid pricing response: expected plain object");
  }
  const obj = raw as Record<string, unknown>;

  let default_interval: BillingInterval = "monthly";
  if (obj.default_interval === "annual") {
    default_interval = "annual";
  } else if (obj.default_interval === "monthly") {
    default_interval = "monthly";
  }

  if (!obj.plans || typeof obj.plans !== "object") {
    throw new Error("Invalid pricing response: missing plans object");
  }

  const rawPlans = obj.plans as Record<string, unknown>;
  const parsedPlans: Record<string, BillingPlanPrice> = {};

  for (const [key, val] of Object.entries(rawPlans)) {
    if (!val || typeof val !== "object") continue;
    const planObj = val as Record<string, unknown>;

    const parseCentVal = (v: unknown): number | null => {
      if (v === null || v === undefined) return null;
      if (typeof v === "number" && Number.isInteger(v) && v >= 0) return v;
      return null;
    };

    const parseStripeId = (v: unknown): string | null => {
      if (typeof v === "string" && v.trim().length > 0) return v.trim();
      return null;
    };

    parsedPlans[key] = {
      monthly_price_cents: parseCentVal(planObj.monthly_price_cents),
      annual_price_cents: parseCentVal(planObj.annual_price_cents),
      annual_savings_cents: parseCentVal(planObj.annual_savings_cents),
      stripe_price_id_monthly: parseStripeId(planObj.stripe_price_id_monthly),
      stripe_price_id_annual: parseStripeId(planObj.stripe_price_id_annual),
    };
  }

  return {
    default_interval,
    plans: parsedPlans,
  };
}

export async function fetchBillingPricing(): Promise<BillingPricingResponse> {
  const { data } = await api.get<unknown>("/billing/pricing");
  return parseBillingPricingResponse(data);
}

export function getPlanIntervalPriceDetails(
  planPrice: BillingPlanPrice | undefined,
  interval: BillingInterval,
): {
  amountCents: number | null;
  stripePriceId: string | null;
  isAvailable: boolean;
  annualSavingsCents: number | null;
} {
  if (!planPrice) {
    return { amountCents: null, stripePriceId: null, isAvailable: false, annualSavingsCents: null };
  }

  if (interval === "annual") {
    const amountCents = planPrice.annual_price_cents;
    const stripePriceId = planPrice.stripe_price_id_annual;
    const isAvailable = amountCents !== null && stripePriceId !== null;
    return {
      amountCents,
      stripePriceId,
      isAvailable,
      annualSavingsCents: planPrice.annual_savings_cents,
    };
  }

  const amountCents = planPrice.monthly_price_cents;
  const stripePriceId = planPrice.stripe_price_id_monthly;
  const isAvailable = amountCents !== null && stripePriceId !== null;
  return {
    amountCents,
    stripePriceId,
    isAvailable,
    annualSavingsCents: null,
  };
}

async function validateAndOpenCheckoutUrl(urlStr: unknown, expectedUserId?: string): Promise<void> {
  if (!urlStr || typeof urlStr !== "string") {
    throw new Error("Stripe did not return a valid checkout URL");
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(urlStr);
  } catch {
    throw new Error("Stripe returned an unparseable checkout URL");
  }

  if (parsedUrl.protocol !== "https:") {
    throw new Error("Stripe checkout URL must use HTTPS protocol");
  }

  if (!parsedUrl.hostname || parsedUrl.username || parsedUrl.password) {
    throw new Error("Stripe checkout URL contains invalid hostname or credentials");
  }

  const canOpen = await Linking.canOpenURL(parsedUrl.href);
  if (!canOpen) {
    throw new Error("Device cannot open the checkout URL");
  }

  if (expectedUserId && useAuthStore.getState().user?.id !== expectedUserId) {
    throw new Error("User identity changed before opening checkout");
  }

  const entitlements = mobileQueryClient.getQueryData<EntitlementsSnapshot>(["billing-entitlements"]);
  if (entitlements) {
    if (entitlements.subscription_status === "subscription_conflict") {
      throw new Error("SUBSCRIPTION_CONFLICT: Multiple active subscriptions require support review.");
    }
    if (entitlements.plan_slug !== "free") {
      throw new Error("ALREADY_SUBSCRIBED: An active subscription already exists for this account.");
    }
  }

  await Linking.openURL(parsedUrl.href);
}

export async function startCheckout(
  planSlug: BillingPlanSlug,
  interval: BillingInterval,
  expectedUserId?: string,
): Promise<void> {
  const alias = checkoutPlanForSlug(planSlug);
  if (!alias) {
    throw new Error("Free and unknown plans cannot initiate paid checkout");
  }

  if (interval !== "monthly" && interval !== "annual") {
    throw new Error("Invalid billing interval for checkout");
  }

  const { data } = await api.post<{ checkout_url?: string }>("/billing/checkout", null, {
    params: { plan: alias, interval, client: "mobile" },
  });

  await validateAndOpenCheckoutUrl(data?.checkout_url, expectedUserId);
}

export async function startTrialCheckout(expectedUserId?: string): Promise<void> {
  const { data } = await api.post<{ checkout_url?: string }>("/billing/trial/start", null, {
    params: { client: "mobile" },
  });

  await validateAndOpenCheckoutUrl(data?.checkout_url, expectedUserId);
}

export function parseCheckoutVerificationResponse(raw: unknown): CheckoutVerificationResponse {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Invalid verification response: expected plain object");
  }
  const record = raw as Record<string, unknown>;

  const kind = record.checkout_kind;
  if (kind !== "subscription" && kind !== "credit_purchase") {
    throw new Error(`Invalid verification response: unknown checkout_kind '${String(kind)}'`);
  }

  if (typeof record.session_id !== "string" || !record.session_id.startsWith("cs_")) {
    throw new Error("Invalid verification response: session_id must be a valid cs_ string");
  }

  const checkout_status = record.checkout_status;
  if (checkout_status !== "open" && checkout_status !== "complete" && checkout_status !== "expired") {
    throw new Error(`Invalid verification response: unknown checkout_status '${String(checkout_status)}'`);
  }

  if (kind === "subscription") {
    const subscription_state = record.subscription_state;
    if (
      subscription_state !== "active" &&
      subscription_state !== "processing" &&
      subscription_state !== "conflict" &&
      subscription_state !== "not_confirmed"
    ) {
      throw new Error(`Invalid verification response: unknown subscription_state '${String(subscription_state)}'`);
    }

    return {
      checkout_kind: "subscription",
      session_id: record.session_id,
      checkout_status,
      subscription_state,
      purchase_state: null,
      plan_slug: (record.plan_slug as any) || null,
      interval: (record.interval as any) || null,
      credit_quantity: null,
      unit_price_cents: null,
      currency: null,
    };
  } else {
    const purchase_state = record.purchase_state;
    if (
      purchase_state !== "processing" &&
      purchase_state !== "credited" &&
      purchase_state !== "not_confirmed"
    ) {
      throw new Error(`Invalid verification response: unknown purchase_state '${String(purchase_state)}'`);
    }

    const qty = record.credit_quantity;
    const credit_quantity = typeof qty === "number" && Number.isInteger(qty) && qty > 0 ? qty : null;

    const price = record.unit_price_cents;
    const unit_price_cents = typeof price === "number" && Number.isInteger(price) && price > 0 ? price : null;

    const curr = record.currency;
    const currency = typeof curr === "string" && curr.trim() ? curr.trim().toLowerCase() : null;

    return {
      checkout_kind: "credit_purchase",
      session_id: record.session_id,
      checkout_status,
      subscription_state: null,
      purchase_state,
      plan_slug: null,
      interval: null,
      credit_quantity,
      unit_price_cents,
      currency,
    };
  }
}

export async function verifyCheckoutSession(
  sessionId: string,
): Promise<CheckoutVerificationResponse> {
  if (!sessionId || !sessionId.startsWith("cs_")) {
    throw new Error("Invalid checkout session ID format");
  }
  const { data } = await api.get<unknown>(
    `/billing/checkout/sessions/${encodeURIComponent(sessionId)}`,
  );
  return parseCheckoutVerificationResponse(data);
}

export function parseSubscriptionCancelResponse(raw: unknown): SubscriptionCancelResponse {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Invalid cancellation response: expected plain object");
  }
  const record = raw as Record<string, unknown>;

  if (typeof record.canceled_at_period_end !== "boolean") {
    throw new Error("Invalid cancellation response: canceled_at_period_end must be boolean");
  }

  if (!record.canceled_at_period_end) {
    throw new Error("Cancellation unconfirmed: canceled_at_period_end is false");
  }

  let current_period_end: string | null = null;
  if (record.current_period_end !== null && record.current_period_end !== undefined) {
    if (typeof record.current_period_end !== "string") {
      throw new Error("Invalid cancellation response: current_period_end must be a string or null");
    }
    const parsedDate = Date.parse(record.current_period_end);
    if (Number.isNaN(parsedDate)) {
      throw new Error("Invalid cancellation response: current_period_end is an invalid date timestamp");
    }
    current_period_end = new Date(parsedDate).toISOString();
  }

  return {
    canceled_at_period_end: record.canceled_at_period_end,
    current_period_end,
  };
}

export async function cancelSubscriptionAtPeriodEnd(): Promise<SubscriptionCancelResponse> {
  const { data } = await api.post<unknown>("/billing/subscription/cancel");
  return parseSubscriptionCancelResponse(data);
}

export function parseCreditPricingResponse(raw: unknown): CreditPricingResponse {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Invalid credit pricing response: expected plain object");
  }
  const record = raw as Record<string, unknown>;
  if (!record.pricing || typeof record.pricing !== "object" || Array.isArray(record.pricing)) {
    throw new Error("Invalid credit pricing response: pricing must be a plain object");
  }
  const pricing = record.pricing as Record<string, unknown>;

  if (typeof pricing.unit_price_cents !== "number" || !Number.isInteger(pricing.unit_price_cents) || pricing.unit_price_cents < 1) {
    throw new Error("Invalid credit pricing response: unit_price_cents must be a positive integer");
  }
  if (typeof pricing.currency !== "string" || !pricing.currency.trim()) {
    throw new Error("Invalid credit pricing response: currency must be a non-empty string");
  }
  if (typeof pricing.unit_price_usd !== "number" || !Number.isFinite(pricing.unit_price_usd) || pricing.unit_price_usd <= 0) {
    throw new Error("Invalid credit pricing response: unit_price_usd must be a positive finite number");
  }
  if (typeof pricing.minimum_quantity !== "number" || !Number.isInteger(pricing.minimum_quantity) || pricing.minimum_quantity < 1) {
    throw new Error("Invalid credit pricing response: minimum_quantity must be a positive integer");
  }

  return {
    pricing: {
      unit_price_cents: pricing.unit_price_cents,
      currency: pricing.currency.trim().toLowerCase(),
      unit_price_usd: pricing.unit_price_usd,
      minimum_quantity: pricing.minimum_quantity,
    },
  };
}

export async function fetchCreditPricing(): Promise<CreditPricingResponse> {
  const { data } = await api.get<unknown>("/credits/pricing");
  return parseCreditPricingResponse(data);
}

export async function startCreditCheckout(
  quantity: number,
  expectedUserId: string,
): Promise<void> {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10000) {
    throw new Error("Quantity must be an integer between 1 and 10,000");
  }
  const currentUser = useAuthStore.getState().user;
  if (!currentUser?.id || currentUser.id !== expectedUserId) {
    throw new Error("User session changed before initiating credit checkout");
  }

  const { data } = await api.post<{ checkout_url?: string }>(`/billing/checkout/credits?quantity=${quantity}&client=mobile`);

  if (useAuthStore.getState().user?.id !== expectedUserId) {
    throw new Error("User identity changed during credit checkout request");
  }

  await validateAndOpenCheckoutUrl(data?.checkout_url, expectedUserId);
}
