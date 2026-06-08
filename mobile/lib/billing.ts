import * as Linking from "expo-linking";

import { api } from "../api/client";

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
