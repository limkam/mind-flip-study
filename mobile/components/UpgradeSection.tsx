import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import {
  fetchBillingPricing,
  fetchEntitlementsSnapshot,
  fetchTrialEligibility,
  formatUsd,
  getPlanIntervalPriceDetails,
  isFreeTier,
  PLAN_LABELS,
  PLAN_ORDER,
  PLAN_TAGLINES,
  startCheckout,
  startTrialCheckout,
  subscriptionLabel,
  subscriptionsEnabled,
} from "../lib/billing";
import { useTheme } from "../hooks/useTheme";
import { hapticImpact } from "../lib/haptics";
import { getApiErrorMessage } from "../lib/apiErrors";
import { useAuthStore } from "../store/authStore";
import type { BillingInterval, BillingPlanSlug, TrialEligibilityReason } from "../types/api";

type Props = {
  subscriptionTier?: string | null;
  showAllPlans?: boolean;
};

export function UpgradeSection({ subscriptionTier, showAllPlans = false }: Props) {
  const { colors } = useTheme();
  const router = useRouter();
  const userId = useAuthStore((s) => s.user?.id);
  const bootstrapStatus = useAuthStore((s) => s.bootstrapStatus);
  const isAuthenticated = bootstrapStatus === "authenticated" && !!userId;

  const isEnabled = subscriptionsEnabled();

  const [interval, setInterval] = useState<BillingInterval>("monthly");
  const [loadingSlug, setLoadingSlug] = useState<BillingPlanSlug | "trial_checkout" | null>(null);

  // Synchronous lock ref to prevent rapid double-taps before React state updates
  const checkoutLockRef = useRef<{
    attemptId: number;
    slug: BillingPlanSlug | "trial_checkout";
    interval: BillingInterval;
    userId: string | null;
  } | null>(null);

  const attemptIdCounterRef = useRef(0);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      checkoutLockRef.current = null;
    };
  }, []);

  const {
    data: pricingData,
    isLoading: isPricingLoading,
    isError: isPricingError,
    refetch: refetchPricing,
  } = useQuery({
    queryKey: ["billing-pricing"],
    queryFn: fetchBillingPricing,
    enabled: isEnabled,
  });

  const {
    data: entitlementsData,
    isLoading: isEntitlementsLoading,
    isError: isEntitlementsError,
    refetch: refetchEntitlements,
  } = useQuery({
    queryKey: ["billing-entitlements"],
    queryFn: fetchEntitlementsSnapshot,
    enabled: isEnabled && isAuthenticated,
  });

  const {
    data: trialData,
    isLoading: isTrialLoading,
    isError: isTrialError,
    refetch: refetchTrial,
  } = useQuery({
    queryKey: ["billing-trial-eligibility"],
    queryFn: fetchTrialEligibility,
    enabled: isEnabled && isAuthenticated,
  });

  // Set initial interval once pricing returns backend default
  const defaultInitializedRef = useRef(false);
  useEffect(() => {
    if (pricingData?.default_interval && !defaultInitializedRef.current) {
      defaultInitializedRef.current = true;
      setInterval(pricingData.default_interval);
    }
  }, [pricingData]);

  // Foreground recovery: refetch entitlements & trial status when app becomes active after checkout browser handoff.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState !== "active") return;
      const pendingAttempt = checkoutLockRef.current;
      if (!pendingAttempt) return;
      // Identity guard
      if (pendingAttempt.userId && useAuthStore.getState().user?.id !== pendingAttempt.userId) {
        checkoutLockRef.current = null;
        return;
      }
      Promise.all([refetchEntitlements(), refetchTrial()]).then(() => {
        if (checkoutLockRef.current?.attemptId === pendingAttempt.attemptId) {
          checkoutLockRef.current = null;
        }
        if (mountedRef.current) {
          setLoadingSlug(null);
        }
      });
    });
    return () => {
      subscription.remove();
    };
  }, [refetchEntitlements, refetchTrial]);

  const activePlanSlug = entitlementsData?.plan_slug || null;
  const isPaidSubscriber = isAuthenticated && activePlanSlug !== null && activePlanSlug !== "free";
  const isConflict = entitlementsData?.subscription_status === "subscription_conflict";

  const handleStartTrial = async () => {
    if (!isAuthenticated) {
      router.push("/(auth)/login");
      return;
    }

    if (
      isEntitlementsLoading ||
      isEntitlementsError ||
      isPaidSubscriber ||
      isConflict ||
      !trialData?.eligible
    ) {
      return;
    }

    if (checkoutLockRef.current !== null) {
      return;
    }

    const currentAttemptId = ++attemptIdCounterRef.current;
    const capturedUserId = userId || null;

    checkoutLockRef.current = {
      attemptId: currentAttemptId,
      slug: "trial_checkout",
      interval: "monthly",
      userId: capturedUserId,
    };
    setLoadingSlug("trial_checkout");

    try {
      await startTrialCheckout(capturedUserId || undefined);
    } catch (e: unknown) {
      if (checkoutLockRef.current?.attemptId === currentAttemptId) {
        checkoutLockRef.current = null;
      }
      if (mountedRef.current) {
        setLoadingSlug(null);
      }
      if (
        mountedRef.current &&
        (!capturedUserId || useAuthStore.getState().user?.id === capturedUserId)
      ) {
        const errorMsg = getApiErrorMessage(e);
        if (errorMsg.includes("TRIAL_NOT_ELIGIBLE") || errorMsg.includes("not eligible")) {
          void refetchTrial();
          void refetchEntitlements();
          Alert.alert(
            "Trial no longer available",
            "Your account is not eligible for a free trial at this time.",
          );
        } else if (errorMsg.includes("ALREADY_SUBSCRIBED") || errorMsg.includes("active subscription")) {
          void refetchEntitlements();
          void refetchTrial();
          Alert.alert(
            "Already subscribed",
            "An active subscription already exists for your account. Manage your plan from Billing & Usage.",
          );
        } else if (errorMsg.includes("SUBSCRIPTION_CONFLICT")) {
          void refetchEntitlements();
          void refetchTrial();
          Alert.alert(
            "Subscription conflict",
            "Multiple active subscriptions require support review before initiating trial checkout.",
          );
        } else {
          Alert.alert(
            "Trial checkout unavailable",
            getApiErrorMessage(e, "Could not start trial checkout."),
          );
        }
      }
    }
  };

  const checkout = async (slug: BillingPlanSlug) => {
    if (slug === "free") return;

    if (!isAuthenticated) {
      router.push("/(auth)/login");
      return;
    }

    if (isEntitlementsLoading || isEntitlementsError || isPaidSubscriber || isConflict) {
      return;
    }

    if (checkoutLockRef.current !== null) {
      return;
    }

    const currentAttemptId = ++attemptIdCounterRef.current;
    const capturedUserId = userId || null;
    const capturedInterval = interval;

    checkoutLockRef.current = {
      attemptId: currentAttemptId,
      slug,
      interval: capturedInterval,
      userId: capturedUserId,
    };
    setLoadingSlug(slug);

    try {
      await startCheckout(slug, capturedInterval, capturedUserId || undefined);
      // Browser opened successfully — keep lock alive for foreground recovery.
      // Loading spinner is cleared by the AppState listener when the user returns.
    } catch (e: unknown) {
      // Release lock on error only
      if (checkoutLockRef.current?.attemptId === currentAttemptId) {
        checkoutLockRef.current = null;
      }
      if (mountedRef.current) {
        setLoadingSlug(null);
      }
      if (
        mountedRef.current &&
        (!capturedUserId || useAuthStore.getState().user?.id === capturedUserId)
      ) {
        const errorMsg = getApiErrorMessage(e);
        if (errorMsg.includes("ALREADY_SUBSCRIBED") || errorMsg.includes("active subscription")) {
          void refetchEntitlements();
          Alert.alert(
            "Already subscribed",
            "An active subscription already exists for your account. Manage your plan from Billing & Usage.",
          );
        } else if (errorMsg.includes("SUBSCRIPTION_CONFLICT")) {
          void refetchEntitlements();
          Alert.alert(
            "Subscription conflict",
            "Multiple active subscriptions require support review before initiating checkout.",
          );
        } else {
          Alert.alert(
            "Checkout unavailable",
            getApiErrorMessage(e, "Could not start checkout."),
          );
        }
      }
    }
  };

  if (!isEnabled) {
    return null;
  }

  if (!showAllPlans && !isFreeTier(subscriptionTier)) {
    return (
      <View
        style={[
          styles.activeCard,
          {
            backgroundColor: colors.primary + "12",
            borderColor: colors.primary + "40",
          },
        ]}
      >
        <Text style={[styles.activeTitle, { color: colors.text }]}>
          {subscriptionLabel(subscriptionTier)} plan active
        </Text>
        <Text style={[styles.activeHint, { color: colors.muted }]}>
          You have full access to uploads, flashcards, and premium study features.
        </Text>
      </View>
    );
  }

  if (isPricingLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={[styles.sub, { color: colors.muted, textAlign: "center" }]}>
          Loading current plans & pricing…
        </Text>
      </View>
    );
  }

  if (isPricingError || !pricingData) {
    return (
      <View style={[styles.activeCard, { borderColor: colors.border, gap: 12 }]}>
        <Text style={[styles.activeTitle, { color: colors.text }]}>
          Pricing catalog unavailable
        </Text>
        <Text style={[styles.sub, { color: colors.muted }]}>
          Could not load the current plans. Please check your network connection and try again.
        </Text>
        <Pressable
          style={[styles.planBtn, { backgroundColor: colors.primary, alignSelf: "flex-start", paddingHorizontal: 20 }]}
          onPress={() => {
            void refetchPricing();
          }}
        >
          <Text style={styles.planBtnText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const validSlugs = PLAN_ORDER.filter((slug) => slug in pricingData.plans);

  if (validSlugs.length === 0) {
    return (
      <View style={[styles.activeCard, { borderColor: colors.border, gap: 12 }]}>
        <Text style={[styles.activeTitle, { color: colors.text }]}>
          No plans available
        </Text>
        <Text style={[styles.sub, { color: colors.muted }]}>
          No active subscription plans were returned by the catalog. Please try again later.
        </Text>
        <Pressable
          style={[styles.planBtn, { backgroundColor: colors.primary, alignSelf: "flex-start", paddingHorizontal: 20 }]}
          onPress={() => {
            void refetchPricing();
          }}
        >
          <Text style={styles.planBtnText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const renderTrialReasonText = (reason: TrialEligibilityReason | null): string | null => {
    switch (reason) {
      case "trial_disabled":
        return "Free trial is currently unavailable.";
      case "already_paid":
        return null;
      case "trial_already_used":
        return "Free trial has already been used for this account.";
      case "subscription_history":
        return "Free trial is unavailable for accounts with prior subscriptions.";
      case "payment_history":
        return "Free trial is unavailable for accounts with prior payment history.";
      default:
        return null;
    }
  };

  const trialReasonText = renderTrialReasonText(trialData?.reason || null);

  const trialDays = trialData?.trial_days ?? 7;

  return (
    <View style={styles.plans}>
      <View style={styles.headerBlock}>
        <Text style={[styles.heading, { color: colors.text }]}>
          Upgrade your plan
        </Text>
        <Text style={[styles.sub, { color: colors.muted }]}>
          Pick the plan that matches your study load. Compare monthly and annual options.
        </Text>
      </View>

      {/* Trial presentation section */}
      {!isAuthenticated ? (
        <Pressable
          style={[
            styles.trialCard,
            {
              backgroundColor: colors.primary + "0B",
              borderColor: colors.primary + "30",
            },
          ]}
          onPress={() => router.push("/(auth)/login")}
          accessibilityRole="button"
          accessibilityLabel="Sign in to check trial eligibility"
        >
          <View style={styles.trialHeaderRow}>
            <Text style={[styles.trialTitle, { color: colors.text }]}>
              {trialDays}-day Free Trial of Premium 30
            </Text>
            <View style={[styles.badge, { backgroundColor: colors.primary + "20" }]}>
              <Text style={[styles.badgeText, { color: colors.primary }]}>{trialDays} Days Free</Text>
            </View>
          </View>
          <Text style={[styles.tagline, { color: colors.muted }]}>
            Sign in to check eligibility for a {trialDays}-day trial of Premium 30.
          </Text>
        </Pressable>
      ) : isTrialLoading ? (
        <View style={[styles.trialCard, { borderColor: colors.border, alignItems: "center", paddingVertical: 14 }]}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={[styles.tagline, { color: colors.muted, marginTop: 4 }]}>
            Checking free trial eligibility…
          </Text>
        </View>
      ) : isTrialError ? (
        <View style={[styles.trialCard, { borderColor: colors.border }]}>
          <Text style={[styles.tagline, { color: colors.muted }]}>
            Could not verify free trial eligibility.
          </Text>
          <Pressable
            style={[styles.planBtn, styles.planBtnOutline, { borderColor: colors.border, marginTop: 8, alignSelf: "flex-start", paddingHorizontal: 16, minHeight: 36 }]}
            onPress={() => void refetchTrial()}
            accessibilityRole="button"
            accessibilityLabel="Retry checking trial eligibility"
          >
            <Text style={[styles.planBtnText, { color: colors.text, fontSize: 13 }]}>Retry</Text>
          </Pressable>
        </View>
      ) : trialData?.eligible ? (
        <View
          style={[
            styles.trialCard,
            {
              backgroundColor: colors.primary + "12",
              borderColor: colors.primary,
            },
          ]}
        >
          <View style={styles.trialHeaderRow}>
            <Text style={[styles.trialTitle, { color: colors.text }]}>
              {trialDays}-day Free Trial of Premium 30
            </Text>
            <View style={[styles.badge, { backgroundColor: colors.primary }]}>
              <Text style={[styles.badgeText, { color: "#fff" }]}>{trialDays} Days Free</Text>
            </View>
          </View>
          <Text style={[styles.tagline, { color: colors.muted }]}>
            Full access to all Premium features for {trialDays} days. $0 today. Card authorization required at checkout.
          </Text>
          <Pressable
            style={[
              styles.planBtn,
              { backgroundColor: colors.primary, marginTop: 8 },
            ]}
            disabled={!!loadingSlug || isEntitlementsLoading || isPaidSubscriber || isConflict}
            onPress={() => {
              void hapticImpact("light");
              void handleStartTrial();
            }}
            accessibilityRole="button"
            accessibilityLabel={`Start ${trialDays}-day Premium trial`}
          >
            {loadingSlug === "trial_checkout" ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.planBtnText}>Start {trialDays}-day Premium trial</Text>
            )}
          </Pressable>
        </View>

      ) : trialReasonText ? (
        <View style={[styles.trialCard, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <Text style={[styles.tagline, { color: colors.muted }]}>
            {trialReasonText}
          </Text>
        </View>
      ) : null}

      {/* Native Interval Selector */}
      <View style={[styles.toggleContainer, { backgroundColor: colors.border + "40" }]}>
        <Pressable
          style={[
            styles.toggleTab,
            interval === "monthly" && [styles.activeToggleTab, { backgroundColor: colors.surface }],
          ]}
          onPress={() => {
            void hapticImpact("light");
            setInterval("monthly");
          }}
        >
          <Text
            style={[
              styles.toggleText,
              { color: interval === "monthly" ? colors.text : colors.muted },
            ]}
          >
            Monthly
          </Text>
        </Pressable>
        <Pressable
          style={[
            styles.toggleTab,
            interval === "annual" && [styles.activeToggleTab, { backgroundColor: colors.surface }],
          ]}
          onPress={() => {
            void hapticImpact("light");
            setInterval("annual");
          }}
        >
          <Text
            style={[
              styles.toggleText,
              { color: interval === "annual" ? colors.text : colors.muted },
            ]}
          >
            Annual
          </Text>
        </Pressable>
      </View>

      <View style={styles.cardsList}>
        {validSlugs.map((slug) => {
          const planPrice = pricingData.plans[slug];
          const isFree = slug === "free";
          const isCurrent = activePlanSlug === slug;
          const label = PLAN_LABELS[slug] || slug;
          const tagline = PLAN_TAGLINES[slug] || "";

          const { amountCents, isAvailable, annualSavingsCents } = getPlanIntervalPriceDetails(planPrice, interval);

          const rawFormatted = isFree ? "$0" : formatUsd(amountCents);
          const formattedPrice = rawFormatted ?? "—";
          const priceSuffix = isFree ? "" : interval === "annual" ? "/year" : "/month";
          const formattedSavings = annualSavingsCents && annualSavingsCents > 0 ? formatUsd(annualSavingsCents) : null;

          const isButtonDisabled =
            !!loadingSlug ||
            isCurrent ||
            isFree ||
            !isAvailable ||
            rawFormatted === null ||
            isPaidSubscriber ||
            isConflict ||
            isEntitlementsLoading;

          let buttonText = `Choose ${label}`;
          if (isCurrent) {
            buttonText = "Current plan";
          } else if (isConflict) {
            buttonText = "Subscription conflict";
          } else if (isPaidSubscriber) {
            buttonText = "Manage subscription";
          } else if (isFree) {
            buttonText = "Included";
          } else if (!isAvailable || rawFormatted === null) {
            buttonText = "Temporarily unavailable";
          }

          return (
            <View
              key={slug}
              style={[
                styles.planCard,
                {
                  backgroundColor: isCurrent ? colors.primary + "0A" : colors.surface,
                  borderColor: isCurrent ? colors.primary : colors.border,
                },
              ]}
            >
              <View style={styles.cardHeader}>
                <View style={styles.cardTitleRow}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>{label}</Text>
                  {isCurrent ? (
                    <View style={[styles.badge, { backgroundColor: colors.primary + "20" }]}>
                      <Text style={[styles.badgeText, { color: colors.primary }]}>Current</Text>
                    </View>
                  ) : null}
                </View>

                <View style={styles.priceRow}>
                  <Text style={[styles.priceText, { color: colors.text }]}>{formattedPrice}</Text>
                  {priceSuffix ? (
                    <Text style={[styles.priceSuffix, { color: colors.muted }]}>{priceSuffix}</Text>
                  ) : null}
                </View>

                {interval === "annual" && formattedSavings ? (
                  <Text style={[styles.savingsText, { color: colors.primary }]}>
                    Save {formattedSavings} per year
                  </Text>
                ) : null}

                <Text style={[styles.tagline, { color: colors.muted }]}>{tagline}</Text>
              </View>

              <Pressable
                style={[
                  styles.planBtn,
                  isCurrent
                    ? { backgroundColor: colors.border }
                    : isFree || !isAvailable
                    ? [styles.planBtnOutline, { borderColor: colors.border }]
                    : { backgroundColor: colors.primary },
                ]}
                disabled={isButtonDisabled}
                onPress={() => {
                  void hapticImpact("light");
                  void checkout(slug);
                }}
              >
                {loadingSlug === slug ? (
                  <ActivityIndicator color={isCurrent || isFree || !isAvailable ? colors.primary : "#fff"} />
                ) : (
                  <Text
                    style={[
                      styles.planBtnText,
                      (isCurrent || isFree || !isAvailable) && { color: colors.muted },
                    ]}
                  >
                    {buttonText}
                  </Text>
                )}
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  plans: { gap: 16 },
  headerBlock: { gap: 4 },
  heading: { fontSize: 18, fontWeight: "700" },
  sub: { fontSize: 14, lineHeight: 20 },
  loadingContainer: { padding: 32, alignItems: "center", justifyContent: "center", gap: 12 },
  toggleContainer: {
    flexDirection: "row",
    borderRadius: 12,
    padding: 4,
  },
  toggleTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: 8,
  },
  activeToggleTab: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  toggleText: {
    fontSize: 14,
    fontWeight: "600",
  },
  cardsList: { gap: 12 },
  planCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 16,
  },
  cardHeader: { gap: 6 },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardTitle: { fontSize: 18, fontWeight: "700" },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  badgeText: { fontSize: 12, fontWeight: "700" },
  priceRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
    marginTop: 2,
  },
  priceText: { fontSize: 26, fontWeight: "800" },
  priceSuffix: { fontSize: 14, fontWeight: "500" },
  savingsText: { fontSize: 13, fontWeight: "600" },
  tagline: { fontSize: 13, lineHeight: 18, marginTop: 2 },
  planBtn: {
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    minHeight: 44,
    justifyContent: "center",
  },
  planBtnText: { color: "#fff", fontWeight: "600", fontSize: 15 },
  planBtnOutline: {
    borderWidth: 1,
    backgroundColor: "transparent",
  },
  activeCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 6,
  },
  activeTitle: { fontSize: 16, fontWeight: "700" },
  activeHint: { fontSize: 14, lineHeight: 20 },
  trialCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 8,
  },
  trialHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  trialTitle: { fontSize: 16, fontWeight: "700" },
});
