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
  CreditPurchaseRecord,
  CreditUsageRecord,
  CreditUsageResponse,
  PurchaseHistoryResponse,
  SubscriptionCancelResponse,
  SubscriptionChangePreviewResponse,
  SubscriptionChangeResponse,
} from "../types/api";
import { mobileFeatures } from "./featureFlags";
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
    available_total: number;
    plan_allocated_credits: number;
    plan_used_credits: number;
    purchased_total_credits: number;
    purchased_used_credits: number;
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

export type CreditUsageEntry = CreditUsageRecord;

export async function fetchEntitlementsSnapshot(): Promise<EntitlementsSnapshot> {
  const { data } = await api.get<EntitlementsSnapshot>("/billing/entitlements/me");
  return data;
}

export async function fetchCreditUsage(): Promise<CreditUsageResponse> {
  const { data } = await api.get<unknown>("/credits/usage");
  return parseCreditUsageResponse(data);
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
  return mobileFeatures.subscriptions;
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

async function validateAndOpenCheckoutUrl(
  urlStr: unknown,
  expectedUserId?: string,
  options?: { isCreditCheckout?: boolean },
): Promise<void> {
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
    if (!options?.isCreditCheckout && entitlements.plan_slug !== "free") {
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
  if (!mobileFeatures.subscriptions) {
    throw new Error("Subscription upgrades are disabled");
  }

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

function parseSubscriptionChangePreviewResponse(raw: unknown): SubscriptionChangePreviewResponse {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Invalid preview response: expected plain object");
  }
  const record = raw as Record<string, unknown>;
  if (typeof record.is_upgrade !== "boolean") {
    throw new Error("Invalid preview response: is_upgrade must be boolean");
  }
  if (typeof record.amount_due_today_cents !== "number") {
    throw new Error("Invalid preview response: amount_due_today_cents must be a number");
  }
  if (typeof record.new_recurring_amount_cents !== "number") {
    throw new Error("Invalid preview response: new_recurring_amount_cents must be a number");
  }
  return {
    is_upgrade: record.is_upgrade,
    plan_slug: String(record.plan_slug || ""),
    billing_interval: String(record.billing_interval || ""),
    amount_due_today_cents: record.amount_due_today_cents,
    new_recurring_amount_cents: record.new_recurring_amount_cents,
    currency: String(record.currency || "usd"),
    effective: record.effective === "immediately" ? "immediately" : "next_period",
    next_billing_date: typeof record.next_billing_date === "string" ? record.next_billing_date : null,
    downgrade_notice: typeof record.downgrade_notice === "string" ? record.downgrade_notice : null,
  };
}

export async function previewSubscriptionChange(
  planSlug: BillingPlanSlug,
  interval: BillingInterval,
): Promise<SubscriptionChangePreviewResponse> {
  const alias = checkoutPlanForSlug(planSlug);
  if (!alias) {
    throw new Error("Free and unknown plans cannot be previewed");
  }
  const { data } = await api.get<unknown>("/billing/subscription/preview-change", {
    params: { plan: alias, interval },
  });
  return parseSubscriptionChangePreviewResponse(data);
}

function parseSubscriptionChangeResponse(raw: unknown): SubscriptionChangeResponse {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Invalid change response: expected plain object");
  }
  const record = raw as Record<string, unknown>;
  if (typeof record.is_upgrade !== "boolean") {
    throw new Error("Invalid change response: is_upgrade must be boolean");
  }
  return {
    is_upgrade: record.is_upgrade,
    plan_slug: String(record.plan_slug || ""),
    billing_interval: String(record.billing_interval || ""),
    effective: record.effective === "immediately" ? "immediately" : "next_period",
    pending_change_effective_at:
      typeof record.pending_change_effective_at === "string" ? record.pending_change_effective_at : null,
  };
}

export async function changeSubscriptionPlan(
  planSlug: BillingPlanSlug,
  interval: BillingInterval,
): Promise<SubscriptionChangeResponse> {
  const alias = checkoutPlanForSlug(planSlug);
  if (!alias) {
    throw new Error("Free and unknown plans cannot be changed to");
  }
  const { data } = await api.post<unknown>("/billing/subscription/change", null, {
    params: { plan: alias, interval },
  });
  return parseSubscriptionChangeResponse(data);
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

  await validateAndOpenCheckoutUrl(data?.checkout_url, expectedUserId, { isCreditCheckout: true });
}

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const VALID_POOLS = new Set(["content", "regen", "purchased"]);

export function parseCreditUsageResponse(raw: unknown): CreditUsageResponse {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Invalid credit usage response: expected plain object");
  }
  const obj = raw as Record<string, unknown>;

  if (!Array.isArray(obj.entries)) {
    throw new Error("Invalid credit usage response: entries must be an array");
  }

  const validEntries: CreditUsageRecord[] = [];
  const seenIds = new Set<string>();
  let discarded_count = 0;
  let discarded_duplicates_count = 0;

  for (const item of obj.entries) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      discarded_count += 1;
      if (__DEV__) console.warn("[parseCreditUsageResponse] Discarding non-object entry");
      continue;
    }
    const row = item as Record<string, unknown>;

    if (typeof row.id !== "string" || !UUID_REGEX.test(row.id)) {
      discarded_count += 1;
      if (__DEV__) console.warn("[parseCreditUsageResponse] Discarding entry with invalid UUID id");
      continue;
    }
    if (typeof row.amount !== "number" || !Number.isInteger(row.amount) || !Number.isSafeInteger(row.amount)) {
      discarded_count += 1;
      if (__DEV__) console.warn("[parseCreditUsageResponse] Discarding entry with invalid amount");
      continue;
    }
    if (typeof row.pool !== "string" || !VALID_POOLS.has(row.pool.trim())) {
      discarded_count += 1;
      if (__DEV__) console.warn("[parseCreditUsageResponse] Discarding entry with invalid or unknown pool");
      continue;
    }
    if (typeof row.reason !== "string" || row.reason.trim().length === 0) {
      discarded_count += 1;
      if (__DEV__) console.warn("[parseCreditUsageResponse] Discarding entry with invalid reason");
      continue;
    }
    if (typeof row.created_at !== "string" || Number.isNaN(Date.parse(row.created_at))) {
      discarded_count += 1;
      if (__DEV__) console.warn("[parseCreditUsageResponse] Discarding entry with invalid created_at");
      continue;
    }

    let expires_at: string | null = null;
    if (row.expires_at !== null && row.expires_at !== undefined) {
      if (typeof row.expires_at === "string" && !Number.isNaN(Date.parse(row.expires_at))) {
        expires_at = row.expires_at;
      } else {
        discarded_count += 1;
        if (__DEV__) console.warn("[parseCreditUsageResponse] Discarding entry with invalid expires_at");
        continue;
      }
    }

    let metadata: Record<string, unknown> | null = null;
    if (row.metadata !== null && row.metadata !== undefined) {
      if (typeof row.metadata === "object" && !Array.isArray(row.metadata)) {
        metadata = row.metadata as Record<string, unknown>;
      }
    } else if (row.meta !== null && row.meta !== undefined) {
      if (typeof row.meta === "object" && !Array.isArray(row.meta)) {
        metadata = row.meta as Record<string, unknown>;
      }
    }

    if (seenIds.has(row.id)) {
      discarded_duplicates_count += 1;
      if (__DEV__) console.warn("[parseCreditUsageResponse] Discarding duplicate entry ID", row.id);
      continue;
    }
    seenIds.add(row.id);

    validEntries.push({
      id: row.id,
      amount: row.amount,
      pool: row.pool.trim(),
      reason: row.reason.trim(),
      metadata,
      expires_at,
      created_at: row.created_at,
    });
  }

  return {
    entries: validEntries,
    discarded_count,
    discarded_duplicates_count,
  };
}

export function parsePurchaseHistoryResponse(raw: unknown): PurchaseHistoryResponse {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Invalid purchase history response: expected plain object");
  }
  const obj = raw as Record<string, unknown>;

  if (!Array.isArray(obj.purchases)) {
    throw new Error("Invalid purchase history response: purchases must be an array");
  }

  let total_purchases = 0;
  if (typeof obj.total_purchases === "number" && Number.isInteger(obj.total_purchases) && obj.total_purchases >= 0) {
    total_purchases = obj.total_purchases;
  } else {
    total_purchases = obj.purchases.length;
  }

  const validPurchases: CreditPurchaseRecord[] = [];
  const seenIds = new Set<string>();
  let discarded_count = 0;
  let discarded_duplicates_count = 0;

  for (const item of obj.purchases) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      discarded_count += 1;
      if (__DEV__) console.warn("[parsePurchaseHistoryResponse] Discarding non-object purchase row");
      continue;
    }
    const row = item as Record<string, unknown>;

    if (typeof row.id !== "string" || !UUID_REGEX.test(row.id)) {
      discarded_count += 1;
      if (__DEV__) console.warn("[parsePurchaseHistoryResponse] Discarding purchase with invalid UUID id");
      continue;
    }
    if (typeof row.quantity !== "number" || !Number.isInteger(row.quantity) || row.quantity <= 0) {
      discarded_count += 1;
      if (__DEV__) console.warn("[parsePurchaseHistoryResponse] Discarding purchase with invalid quantity");
      continue;
    }
    if (typeof row.amount_paid_cents !== "number" || !Number.isInteger(row.amount_paid_cents) || row.amount_paid_cents < 0) {
      discarded_count += 1;
      if (__DEV__) console.warn("[parsePurchaseHistoryResponse] Discarding purchase with invalid amount_paid_cents");
      continue;
    }
    if (typeof row.unit_price_cents !== "number" || !Number.isInteger(row.unit_price_cents) || row.unit_price_cents <= 0) {
      discarded_count += 1;
      if (__DEV__) console.warn("[parsePurchaseHistoryResponse] Discarding purchase with invalid unit_price_cents");
      continue;
    }
    if (typeof row.currency !== "string" || row.currency.trim().length === 0) {
      discarded_count += 1;
      if (__DEV__) console.warn("[parsePurchaseHistoryResponse] Discarding purchase with invalid currency");
      continue;
    }
    if (typeof row.created_at !== "string" || Number.isNaN(Date.parse(row.created_at))) {
      discarded_count += 1;
      if (__DEV__) console.warn("[parsePurchaseHistoryResponse] Discarding purchase with invalid created_at");
      continue;
    }
    if (typeof row.status !== "string" || row.status.trim().length === 0) {
      discarded_count += 1;
      if (__DEV__) console.warn("[parsePurchaseHistoryResponse] Discarding purchase with invalid status");
      continue;
    }

    if (seenIds.has(row.id)) {
      discarded_duplicates_count += 1;
      if (__DEV__) console.warn("[parsePurchaseHistoryResponse] Discarding duplicate purchase ID", row.id);
      continue;
    }
    seenIds.add(row.id);

    validPurchases.push({
      id: row.id,
      quantity: row.quantity,
      amount_paid_cents: row.amount_paid_cents,
      currency: row.currency.trim().toLowerCase(),
      unit_price_cents: row.unit_price_cents,
      created_at: row.created_at,
      status: row.status.trim().toLowerCase(),
      receipt_url: typeof row.receipt_url === "string" && row.receipt_url.startsWith("https://") ? row.receipt_url : null,
    });
  }

  if (total_purchases < validPurchases.length) {
    total_purchases = validPurchases.length;
  }

  return {
    purchases: validPurchases,
    total_purchases,
    discarded_count,
    discarded_duplicates_count,
  };
}

export async function fetchCreditPurchaseHistory(): Promise<PurchaseHistoryResponse> {
  const { data } = await api.get<unknown>("/credits/purchase-history");
  return parsePurchaseHistoryResponse(data);
}

export function formatCurrency(cents: number | null | undefined, currencyStr: string = "usd"): string | null {
  if (cents === null || cents === undefined || !Number.isInteger(cents) || cents < 0) {
    return null;
  }
  const normCurrency = (currencyStr || "usd").trim().toUpperCase();
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: normCurrency,
    }).format(cents / 100);
  } catch {
    const dollars = (cents / 100).toFixed(2);
    return `${normCurrency} ${dollars}`;
  }
}

export function formatExpiryText(expires_at: string | null | undefined): string | null {
  if (!expires_at || typeof expires_at !== "string") return null;
  const ms = Date.parse(expires_at);
  if (Number.isNaN(ms)) return null;

  try {
    const formatted = new Date(ms).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
    if (ms < Date.now()) {
      return `Expired ${formatted}`;
    }
    return `Expires ${formatted}`;
  } catch {
    return null;
  }
}

export const REASON_LABELS: Record<string, string> = {
  signup_free_grant: "Initial free credits granted",
  monthly_allowance: "Monthly content allowance",
  monthly_regen_allowance: "Monthly regeneration allowance",
  purchased_credits: "Purchased credits added",
  create_book: "Book processed",
  create_set: "Flashcard set generated",
  regen: "Content regenerated",
  study_group_attachment: "Study-group material added",
  accept_challenge: "Challenge accepted",
};

export function getCreditReasonLabel(reason: string): string {
  if (!reason || typeof reason !== "string") return "Credit activity";
  const trimmed = reason.trim();
  if (REASON_LABELS[trimmed]) {
    return REASON_LABELS[trimmed];
  }
  return "Credit activity";
}
