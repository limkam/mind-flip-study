import { BillingInterval, BillingPlanSlug } from "../types/api";

export type CheckoutKind = "subscription" | "credit_purchase";

export type CheckoutAttempt = {
  attemptId: number;
  kind: CheckoutKind;
  userId: string;
  startedAt: number;
  planSlug?: BillingPlanSlug;
  interval?: BillingInterval;
  quantity?: number;
};

const EXPIRATION_MS = 15 * 60 * 1000; // 15 minutes max duration for a checkout attempt

let currentAttempt: CheckoutAttempt | null = null;
let attemptSeq = 0;

export function claimCheckoutAttempt(
  kind: CheckoutKind,
  userId: string,
  details?: {
    planSlug?: BillingPlanSlug;
    interval?: BillingInterval;
    quantity?: number;
  },
): CheckoutAttempt | null {
  const now = Date.now();
  if (currentAttempt) {
    if (now - currentAttempt.startedAt > EXPIRATION_MS || currentAttempt.userId !== userId) {
      currentAttempt = null;
    } else {
      // Active checkout attempt in progress for this user
      return null;
    }
  }

  attemptSeq += 1;
  currentAttempt = {
    attemptId: attemptSeq,
    kind,
    userId,
    startedAt: now,
    planSlug: details?.planSlug,
    interval: details?.interval,
    quantity: details?.quantity,
  };

  return currentAttempt;
}

export function releaseCheckoutAttempt(attemptId: number, userId: string): boolean {
  if (currentAttempt && currentAttempt.attemptId === attemptId && currentAttempt.userId === userId) {
    currentAttempt = null;
    return true;
  }
  return false;
}

export function getCheckoutAttempt(): CheckoutAttempt | null {
  if (currentAttempt) {
    if (Date.now() - currentAttempt.startedAt > EXPIRATION_MS) {
      currentAttempt = null;
      return null;
    }
  }
  return currentAttempt;
}

export function clearCheckoutAttemptForUser(userId: string): void {
  if (currentAttempt && currentAttempt.userId === userId) {
    currentAttempt = null;
  }
}
