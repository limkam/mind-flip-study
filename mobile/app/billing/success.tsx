import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";

import { Screen } from "../../components/Screen";
import { useTheme } from "../../hooks/useTheme";
import {
  fetchBillingPricing,
  fetchEntitlementsSnapshot,
  formatUsd,
  getPlanIntervalPriceDetails,
  PLAN_LABELS,
  subscriptionsEnabled,
  verifyCheckoutSession,
} from "../../lib/billing";
import { mobileQueryClient } from "../../lib/queryClient";
import { useAuthStore } from "../../store/authStore";
import { TOKENS } from "../../theme/tokens";
import type { BillingInterval, BillingPlanSlug, CheckoutVerificationResponse } from "../../types/api";

/** Bounded reconciliation: poll entitlements at this interval. */
const RECONCILE_INTERVAL_MS = 2_000;
/** Maximum bounded reconciliation attempts before showing "still processing". */
const MAX_RECONCILE_ATTEMPTS = 5;
/** Seconds shown on the auto-redirect countdown once activation is confirmed. */
const REDIRECT_SECONDS = 3;

type ActivationDetails = {
  planLabel: string;
  amountCents: number | null;
  nextBillingDateIso: string | null;
};

type ScreenStatus =
  | "verifying"
  | "reconciling"
  | "activated"
  | "processing"
  | "conflict"
  | "error";

function parseSessionId(param: string | string[] | undefined): string | null {
  if (!param) return null;
  const raw = Array.isArray(param) ? param[0] : param;
  if (typeof raw !== "string") return null;
  try {
    const decoded = decodeURIComponent(raw).trim();
    if (decoded.length < 10 || decoded.length > 255) return null;
    if (!/^cs_[a-zA-Z0-9_]+$/.test(decoded)) return null;
    return decoded;
  } catch {
    return null;
  }
}

export default function BillingSuccessScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ session_id?: string }>();
  const user = useAuthStore((state) => state.user);

  const sessionId = parseSessionId(params.session_id) || "";
  const [statusState, setStatusState] = useState<ScreenStatus>("verifying");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [details, setDetails] = useState<ActivationDetails | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(REDIRECT_SECONDS);

  const verificationRef = useRef<CheckoutVerificationResponse | null>(null);
  const attemptsRef = useRef(0);
  const mountedRef = useRef(true);
  /** Track session IDs that have already reached a terminal state to block re-processing. */
  const terminalSessionsRef = useRef<Set<string>>(new Set());
  /** Prevent overlapping verification/reconciliation sequences. */
  const verifyLockRef = useRef(false);
  const revealAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /** Display-only lookup of what changed; never influences the verification state machine above. */
  const loadActivationDetails = useCallback(
    async (planSlug: BillingPlanSlug | null, interval: BillingInterval | null, renewalDateIso: string | null) => {
      if (!mountedRef.current) return;
      const planLabel = (planSlug && PLAN_LABELS[planSlug]) || "your plan";
      let amountCents: number | null = null;
      try {
        const pricing = await fetchBillingPricing();
        if (planSlug && interval) {
          amountCents = getPlanIntervalPriceDetails(pricing.plans[planSlug], interval).amountCents;
        }
      } catch {
        amountCents = null;
      }
      if (!mountedRef.current) return;
      setDetails({ planLabel, amountCents, nextBillingDateIso: renewalDateIso });
    },
    [],
  );

  useEffect(() => {
    if (statusState !== "activated") return undefined;
    revealAnim.setValue(0);
    Animated.timing(revealAnim, {
      toValue: 1,
      duration: TOKENS.motion.duration.celebration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

    setSecondsLeft(REDIRECT_SECONDS);
    const tick = setInterval(() => {
      setSecondsLeft((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    const redirect = setTimeout(() => router.replace("/(tabs)"), REDIRECT_SECONDS * 1000);
    return () => {
      clearInterval(tick);
      clearTimeout(redirect);
    };
  }, [statusState, revealAnim, router]);

  const runFullVerification = useCallback(async () => {
    if (!sessionId) {
      setStatusState("error");
      setErrorMessage("This checkout link is invalid or incomplete.");
      return;
    }

    const currentUserId = useAuthStore.getState().user?.id;
    if (!currentUserId) {
      setStatusState("error");
      setErrorMessage("Sign in again to confirm your purchase.");
      return;
    }

    if (terminalSessionsRef.current.has(sessionId)) {
      return;
    }

    if (verifyLockRef.current) {
      return;
    }
    verifyLockRef.current = true;

    setStatusState("verifying");
    attemptsRef.current = 0;

    try {
      const verifyRes = await verifyCheckoutSession(sessionId);
      if (!mountedRef.current) return;

      // Identity change during network call
      if (useAuthStore.getState().user?.id !== currentUserId) {
        setStatusState("error");
        setErrorMessage("Your account changed while confirming this purchase. Please try again.");
        return;
      }

      verificationRef.current = verifyRes;

      if (verifyRes.checkout_kind !== "subscription") {
        setStatusState("error");
        setErrorMessage("This purchase couldn't be applied to a subscription. Please return to Billing.");
        return;
      }

      if (verifyRes.subscription_state === "conflict") {
        terminalSessionsRef.current.add(sessionId);
        setStatusState("conflict");
        return;
      }

      if (verifyRes.subscription_state === "active") {
        terminalSessionsRef.current.add(sessionId);
        const entitlements = await fetchEntitlementsSnapshot();
        if (!mountedRef.current) return;
        mobileQueryClient.setQueryData(["billing-entitlements"], entitlements);
        await mobileQueryClient.invalidateQueries({ queryKey: ["billing-entitlements"] });
        await mobileQueryClient.invalidateQueries({ queryKey: ["credit-usage"] });
        if (!mountedRef.current) return;
        setStatusState("activated");
        void loadActivationDetails(verifyRes.plan_slug, verifyRes.interval, entitlements.renewal_or_end_date);
        return;
      }

      if (verifyRes.checkout_status !== "complete") {
        // Session is open or expired — not proof of payment
        setStatusState("error");
        setErrorMessage(
          verifyRes.checkout_status === "expired"
            ? "This checkout has expired."
            : "Checkout has not been completed yet.",
        );
        return;
      }

      // Checkout complete but webhook not yet processed — bounded reconciliation
      setStatusState("reconciling");
      await reconcileEntitlements(currentUserId, verifyRes.plan_slug);
    } catch {
      if (!mountedRef.current) return;
      setStatusState("error");
      setErrorMessage("We couldn't confirm this purchase. Please try again.");
    } finally {
      verifyLockRef.current = false;
    }
  }, [sessionId, loadActivationDetails]);

  const reconcileEntitlements = async (
    expectedUserId: string,
    expectedPlanSlug: string | null,
  ) => {
    attemptsRef.current += 1;

    // Identity guard
    if (useAuthStore.getState().user?.id !== expectedUserId) {
      if (mountedRef.current) {
        setStatusState("error");
        setErrorMessage("Your account changed while confirming this purchase.");
      }
      return;
    }

    try {
      const entitlements = await fetchEntitlementsSnapshot();
      if (!mountedRef.current) return;

      if (entitlements.subscription_status === "subscription_conflict") {
        terminalSessionsRef.current.add(sessionId);
        setStatusState("conflict");
        return;
      }

      // Confirm the expected plan has an access-bearing Stripe status.
      const isConfirmedStatus =
        entitlements.subscription_status === "active" ||
        entitlements.subscription_status === "trialing";
      const isActivePaid = entitlements.plan_slug !== "free" && isConfirmedStatus;
      const planMatches = !expectedPlanSlug || entitlements.plan_slug === expectedPlanSlug;

      if (isActivePaid && planMatches) {
        terminalSessionsRef.current.add(sessionId);
        mobileQueryClient.setQueryData(["billing-entitlements"], entitlements);
        await mobileQueryClient.invalidateQueries({ queryKey: ["billing-entitlements"] });
        if (!mountedRef.current) return;
        setStatusState("activated");
        void loadActivationDetails(
          (entitlements.plan_slug as BillingPlanSlug) ?? null,
          verificationRef.current?.interval ?? null,
          entitlements.renewal_or_end_date,
        );
        return;
      }

      if (attemptsRef.current < MAX_RECONCILE_ATTEMPTS) {
        await new Promise((resolve) => {
          const timer = setTimeout(resolve, RECONCILE_INTERVAL_MS);
          // If unmounted during wait, clean up
          if (!mountedRef.current) {
            clearTimeout(timer);
            return;
          }
        });
        if (!mountedRef.current) return;
        await reconcileEntitlements(expectedUserId, expectedPlanSlug);
      } else {
        setStatusState("processing");
      }
    } catch {
      if (!mountedRef.current) return;
      setStatusState("processing");
    }
  };

  // Run verification on mount or when session_id / user changes
  useEffect(() => {
    void runFullVerification();
  }, [runFullVerification, user?.id]);

  return (
    <Screen edges={["bottom"]}>
      <Stack.Screen options={{ title: "Checkout status" }} />
      <View style={styles.container}>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>

          {/* Verifying / Reconciling */}
          {(statusState === "verifying" || statusState === "reconciling") && (
            <>
              <ActivityIndicator size="large" color={colors.primary} style={{ marginVertical: 12 }} />
              <Text style={[styles.title, { color: colors.text }]}>Checking subscription…</Text>
              <Text style={[styles.sub, { color: colors.muted }]}>
                Confirming your payment and updating your account privileges.
              </Text>
            </>
          )}

          {/* Activated */}
          {statusState === "activated" && (
            <Animated.View
              style={{
                opacity: revealAnim,
                transform: [
                  { translateY: revealAnim.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) },
                  { scale: revealAnim.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) },
                ],
                alignItems: "center",
              }}
            >
              <View style={[styles.iconWrapper, { backgroundColor: colors.success + "20" }]}>
                <Ionicons name="checkmark-circle" size={48} color={colors.success} />
              </View>
              <Text style={[styles.title, { color: colors.text }]}>
                {details ? `You're on the ${details.planLabel} plan!` : "Subscription activated!"}
              </Text>
              <Text style={[styles.sub, { color: colors.muted }]}>
                Full plan features and credits are now available.
              </Text>
              {details && (details.amountCents != null || details.nextBillingDateIso) && (
                <View style={[styles.detailsCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  {details.amountCents != null && formatUsd(details.amountCents) && (
                    <Text style={[styles.detailsText, { color: colors.text }]}>
                      Charged <Text style={{ fontWeight: "800" }}>{formatUsd(details.amountCents)}</Text>
                    </Text>
                  )}
                  {details.nextBillingDateIso && (
                    <Text style={[styles.detailsText, { color: colors.text }]}>
                      Renews{" "}
                      <Text style={{ fontWeight: "800" }}>
                        {new Date(details.nextBillingDateIso).toLocaleDateString(undefined, {
                          year: "numeric", month: "long", day: "numeric",
                        })}
                      </Text>
                    </Text>
                  )}
                </View>
              )}
              <View style={styles.actions}>
                <Pressable
                  style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
                  onPress={() => router.replace("/(tabs)")}
                >
                  <Text style={styles.primaryBtnText}>
                    Continue{secondsLeft > 0 ? ` (${secondsLeft})` : ""}
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.secondaryBtn, { borderColor: colors.border }]}
                  onPress={() => router.replace("/billing")}
                >
                  <Text style={[styles.secondaryBtnText, { color: colors.text }]}>View Billing & Credits</Text>
                </Pressable>
              </View>
            </Animated.View>
          )}

          {/* Still processing */}
          {statusState === "processing" && (
            <>
              <View style={[styles.iconWrapper, { backgroundColor: colors.warning + "20" }]}>
                <Ionicons name="time-outline" size={48} color={colors.warning} />
              </View>
              <Text style={[styles.title, { color: colors.text }]}>Still processing</Text>
              <Text style={[styles.sub, { color: colors.muted }]}>
                Your checkout is complete. Subscription confirmation is taking a moment. Your plan will activate shortly.
              </Text>
              <View style={styles.actions}>
                <Pressable
                  style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
                  onPress={() => {
                    terminalSessionsRef.current.delete(sessionId);
                    void runFullVerification();
                  }}
                >
                  <Text style={styles.primaryBtnText}>Check again</Text>
                </Pressable>
                <Pressable
                  style={[styles.secondaryBtn, { borderColor: colors.border }]}
                  onPress={() => router.replace("/billing")}
                >
                  <Text style={[styles.secondaryBtnText, { color: colors.text }]}>Open Billing & Credits</Text>
                </Pressable>
              </View>
            </>
          )}

          {/* Conflict */}
          {statusState === "conflict" && (
            <>
              <View style={[styles.iconWrapper, { backgroundColor: colors.danger + "20" }]}>
                <Ionicons name="alert-circle" size={48} color={colors.danger} />
              </View>
              <Text style={[styles.title, { color: colors.text }]}>Subscription conflict</Text>
              <Text style={[styles.sub, { color: colors.muted }]}>
                Multiple active subscriptions require support review. Please check Billing & Credits.
              </Text>
              <View style={styles.actions}>
                <Pressable
                  style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
                  onPress={() => router.replace("/billing")}
                >
                  <Text style={styles.primaryBtnText}>Open Billing & Credits</Text>
                </Pressable>
              </View>
            </>
          )}

          {/* Error */}
          {statusState === "error" && (
            <>
              <View style={[styles.iconWrapper, { backgroundColor: colors.danger + "20" }]}>
                <Ionicons name="close-circle" size={48} color={colors.danger} />
              </View>
              <Text style={[styles.title, { color: colors.text }]}>Unable to confirm checkout</Text>
              <Text style={[styles.sub, { color: colors.muted }]}>
                {errorMessage || "We couldn't confirm this purchase for your account."}
              </Text>
              <View style={styles.actions}>
                <Pressable
                  style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
                  onPress={() => {
                    terminalSessionsRef.current.delete(sessionId);
                    void runFullVerification();
                  }}
                >
                  <Text style={styles.primaryBtnText}>Try Again</Text>
                </Pressable>
                <Pressable
                  style={[styles.secondaryBtn, { borderColor: colors.border }]}
                  onPress={() => router.replace(subscriptionsEnabled() ? "/pricing" : "/billing")}
                >
                  <Text style={[styles.secondaryBtnText, { color: colors.text }]}>
                    {subscriptionsEnabled() ? "Return to Plans" : "Return to Billing"}
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.secondaryBtn, { borderColor: colors.border }]}
                  onPress={() => router.replace("/billing")}
                >
                  <Text style={[styles.secondaryBtnText, { color: colors.text }]}>Open Billing & Credits</Text>
                </Pressable>
              </View>
            </>
          )}

        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, justifyContent: "center" },
  card: { borderWidth: 1, borderRadius: 20, padding: 24, alignItems: "center", gap: 12 },
  iconWrapper: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 22, fontWeight: "800", textAlign: "center" },
  sub: { fontSize: 15, textAlign: "center", lineHeight: 22 },
  detailsCard: { width: "100%", borderWidth: 1, borderRadius: 14, padding: 14, gap: 6, marginTop: 4 },
  detailsText: { fontSize: 14, textAlign: "center" },
  actions: { width: "100%", gap: 10, marginTop: 12 },
  primaryBtn: { paddingHorizontal: 24, paddingVertical: 14, borderRadius: 12, alignItems: "center" },
  primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  secondaryBtn: { borderWidth: 1, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 12, alignItems: "center" },
  secondaryBtnText: { fontWeight: "700", fontSize: 16 },
});
