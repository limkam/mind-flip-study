import * as Linking from "expo-linking";

import { api } from "../api/client";

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

export async function fetchEntitlementsSnapshot(): Promise<EntitlementsSnapshot> {
  const { data } = await api.get<EntitlementsSnapshot>("/billing/entitlements/me");
  return data;
}

/** Set EXPO_PUBLIC_SUBSCRIPTIONS_ENABLED=true to show upgrade UI in profile. */
export function subscriptionsEnabled(): boolean {
  return process.env.EXPO_PUBLIC_SUBSCRIPTIONS_ENABLED === "true";
}

export function isFreeTier(subscriptionTier?: string | null): boolean {
  return !subscriptionTier || subscriptionTier === "free";
}

export function subscriptionLabel(subscriptionTier?: string | null): string {
  if (subscriptionTier === "premium") return "Premium";
  if (subscriptionTier === "student") return "Student";
  return "Free";
}

export async function startCheckout(plan: "basic" | "premium" = "basic"): Promise<void> {
  const { data } = await api.post<{ checkout_url?: string }>("/billing/checkout", null, {
    params: { plan },
  });
  if (!data?.checkout_url) {
    throw new Error("Stripe did not return a checkout URL");
  }
  await Linking.openURL(data.checkout_url);
}
