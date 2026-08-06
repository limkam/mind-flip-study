import * as Linking from "expo-linking";

import { api } from "../api/client";
import type {
  BillingInterval,
  BillingPlanPrice,
  BillingPlanSlug,
  BillingPricingResponse,
} from "../types/api";

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
    params: { plan: alias, interval },
  });

  const urlStr = data?.checkout_url;
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
    throw new Error("Unable to open checkout URL on this device");
  }

  await Linking.openURL(parsedUrl.href);
}
