import React, { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Screen } from "../components/Screen";
import { useTheme } from "../hooks/useTheme";
import { getApiErrorMessage } from "../lib/apiErrors";
import { cancelSubscriptionAtPeriodEnd, fetchCreditUsage, fetchEntitlementsSnapshot } from "../lib/billing";
import { useAuthStore } from "../store/authStore";

const PLAN_NAMES: Record<string, string> = {
  free: "Free",
  quick_72: "Quick 7",
  standard_15: "Standard 15",
  premium_30: "Premium 30",
};

type ParsedDate = {
  formatted: string | null;
  isPast: boolean;
};

function parseAndFormatDate(dateStr: string | null | undefined): ParsedDate {
  if (!dateStr || typeof dateStr !== "string") return { formatted: null, isPast: false };
  const ms = Date.parse(dateStr);
  if (Number.isNaN(ms)) return { formatted: null, isPast: false };

  const nowMs = Date.now();
  const isPast = ms < nowMs;

  try {
    const formatted = new Date(ms).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
    return { formatted, isPast };
  } catch {
    return { formatted: null, isPast };
  }
}

type CancellationLock =
  | {
      phase: "confirming";
      attemptId: number;
      userId: string;
      planSlug: string;
    }
  | {
      phase: "submitting";
      attemptId: number;
      userId: string;
      planSlug: string;
    };

export default function BillingScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const [loadingCancel, setLoadingCancel] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelSuccessMsg, setCancelSuccessMsg] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const attemptSeqRef = useRef(0);
  const cancellationLockRef = useRef<CancellationLock | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cancellationLockRef.current = null;
    };
  }, []);

  const entitlements = useQuery({
    queryKey: ["billing-entitlements"],
    queryFn: fetchEntitlementsSnapshot,
    staleTime: 30_000,
  });

  const usage = useQuery({
    queryKey: ["credit-usage"],
    queryFn: fetchCreditUsage,
  });

  const plan = entitlements.data;
  const balances = plan?.balances;
  const planSlug = plan?.plan_slug || "free";
  const subStatus = plan?.subscription_status || "free";
  const renewalOrEndDate = plan?.renewal_or_end_date;
  const parsedDate = parseAndFormatDate(renewalOrEndDate);

  const isConflict = subStatus === "subscription_conflict";
  const isPaidActive = subStatus === "active" && planSlug !== "free";
  const isTrialing = subStatus === "trialing";
  const isCanceledStatus = subStatus === "canceled";

  // Access remains usable if plan is not free and period end is null or in the future
  const accessUsable = planSlug !== "free" && !parsedDate.isPast;

  // Cancellation scheduled at period end: status is canceled, but access remains active through period end date
  const isCancelingAtPeriodEnd = isCanceledStatus && accessUsable;

  // Expired: canceled or inactive status where end date has passed or plan is free
  const isFullyExpired = (isCanceledStatus && parsedDate.isPast) || (subStatus === "free" && planSlug === "free");

  // Can cancel if currently active or trialing with valid access, no conflict, not loading, and not already canceling
  const canCancel = (isPaidActive || isTrialing) && accessUsable && !isConflict && !entitlements.isLoading;

  const handleCancelPress = () => {
    // 1. Synchronous confirmation guard: reject rapid duplicate taps
    if (
      !canCancel ||
      !user?.id ||
      loadingCancel ||
      cancellationLockRef.current !== null ||
      entitlements.isFetching
    ) {
      return;
    }

    attemptSeqRef.current += 1;
    const currentAttemptId = attemptSeqRef.current;
    const capturedUserId = user.id;
    const capturedPlanSlug = planSlug;

    cancellationLockRef.current = {
      phase: "confirming",
      attemptId: currentAttemptId,
      userId: capturedUserId,
      planSlug: capturedPlanSlug,
    };

    const formattedDate = parsedDate.formatted;
    const title = "Cancel subscription?";
    let body = "Your subscription will not renew. You will keep access until the end of the current billing period.";
    if (isTrialing) {
      body = formattedDate
        ? `Your trial will not renew into a paid subscription. Access remains available until your trial ends on ${formattedDate}.`
        : "Your trial will not renew into a paid subscription. Access remains available until the trial ends.";
    } else if (formattedDate) {
      body = `Your subscription will not renew. You will keep access until ${formattedDate}.`;
    }

    Alert.alert(title, body, [
      {
        text: "Keep subscription",
        style: "cancel",
        onPress: () => {
          if (cancellationLockRef.current?.attemptId === currentAttemptId) {
            cancellationLockRef.current = null;
          }
        },
      },
      {
        text: "Cancel at period end",
        style: "destructive",
        onPress: () => {
          executeCancellation(currentAttemptId, capturedUserId, capturedPlanSlug);
        },
      },
    ]);
  };

  const executeCancellation = async (
    attemptId: number,
    capturedUserId: string,
    capturedPlanSlug: string
  ) => {
    // 2. Pre-request freshness and lock ownership checks
    const latestUser = useAuthStore.getState().user;
    if (
      !mountedRef.current ||
      !latestUser?.id ||
      latestUser.id !== capturedUserId ||
      cancellationLockRef.current?.attemptId !== attemptId ||
      cancellationLockRef.current.phase !== "confirming"
    ) {
      cancellationLockRef.current = null;
      return;
    }

    // Check latest snapshot data available from query client
    const freshPlan = entitlements.data;
    const freshSlug = freshPlan?.plan_slug || "free";
    const freshStatus = freshPlan?.subscription_status || "free";
    const freshDate = parseAndFormatDate(freshPlan?.renewal_or_end_date);
    const freshAccessUsable = freshSlug !== "free" && !freshDate.isPast;

    const freshCanCancel =
      (freshStatus === "active" || freshStatus === "trialing") &&
      freshAccessUsable;

    if (!freshCanCancel) {
      cancellationLockRef.current = null;
      setCancelError("Subscription state changed before cancellation could be sent.");
      return;
    }

    // Transition lock from confirming to submitting
    cancellationLockRef.current = {
      phase: "submitting",
      attemptId,
      userId: capturedUserId,
      planSlug: capturedPlanSlug,
    };

    setLoadingCancel(true);
    setCancelError(null);
    setCancelSuccessMsg(null);

    try {
      const res = await cancelSubscriptionAtPeriodEnd();

      // 3. Post-response ownership verification
      if (
        !mountedRef.current ||
        cancellationLockRef.current?.attemptId !== attemptId ||
        useAuthStore.getState().user?.id !== capturedUserId
      ) {
        return;
      }

      const resParsed = parseAndFormatDate(res.current_period_end);
      const resDateFormatted = resParsed.formatted || freshDate.formatted;

      const successText = resDateFormatted
        ? `Cancellation scheduled. Your subscription will end on ${resDateFormatted}. Access remains active until then.`
        : "Cancellation scheduled. Your subscription will end at period close. Access remains active until then.";

      setCancelSuccessMsg(successText);

      try {
        await entitlements.refetch();
      } catch (refreshErr) {
        if (mountedRef.current) {
          setCancelError(
            `Cancellation scheduled, but account details could not be refreshed immediately (${getApiErrorMessage(refreshErr, "Network error")}). Please pull down to refresh.`
          );
        }
      }
    } catch (err) {
      if (
        !mountedRef.current ||
        cancellationLockRef.current?.attemptId !== attemptId ||
        useAuthStore.getState().user?.id !== capturedUserId
      ) {
        return;
      }

      const rawErr = err as { response?: { status?: number; data?: { detail?: unknown } } };
      const status = rawErr?.response?.status;
      const detailObj = rawErr?.response?.data?.detail;
      const errorCode =
        detailObj && typeof detailObj === "object"
          ? (detailObj as Record<string, unknown>).code
          : null;

      if (status === 404) {
        setCancelError("No active subscription was found for this account.");
        entitlements.refetch();
      } else if (status === 409 || errorCode === "SUBSCRIPTION_CONFLICT") {
        setCancelError("Your subscription requires review before it can be changed.");
        entitlements.refetch();
      } else if (status === 503) {
        setCancelError("Subscription service is temporarily unavailable. Please try again later.");
      } else {
        setCancelError(getApiErrorMessage(err, "Subscription cancellation failed. Please try again later."));
      }
    } finally {
      if (
        mountedRef.current &&
        cancellationLockRef.current?.attemptId === attemptId
      ) {
        cancellationLockRef.current = null;
        setLoadingCancel(false);
      }
    }
  };

  return (
    <Screen edges={["bottom"]}>
      <Stack.Screen options={{ title: "Billing & credits" }} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {isConflict ? (
          <View style={[styles.banner, { backgroundColor: colors.warning + "20", borderColor: colors.warning }]}>
            <Text style={[styles.bannerTitle, { color: colors.text }]}>Subscription Review Required</Text>
            <Text style={[styles.bannerText, { color: colors.muted }]}>
              Multiple active subscriptions require support review. Cancellation and new checkouts are temporarily disabled.
            </Text>
          </View>
        ) : null}

        {cancelSuccessMsg ? (
          <View style={[styles.banner, { backgroundColor: colors.success + "20", borderColor: colors.success }]}>
            <Text style={[styles.bannerTitle, { color: colors.success }]}>Cancellation Scheduled</Text>
            <Text style={[styles.bannerText, { color: colors.text }]}>{cancelSuccessMsg}</Text>
          </View>
        ) : null}

        {cancelError ? (
          <View style={[styles.banner, { backgroundColor: colors.danger + "20", borderColor: colors.danger }]}>
            <Text style={[styles.bannerTitle, { color: colors.danger }]}>Notice</Text>
            <Text style={[styles.bannerText, { color: colors.text }]}>{cancelError}</Text>
          </View>
        ) : null}

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.label, { color: colors.muted }]}>Current plan</Text>
          <Text style={[styles.plan, { color: colors.text }]}>{PLAN_NAMES[planSlug] || planSlug}</Text>

          <View style={styles.statusRow}>
            <Text
              style={[
                styles.statusBadge,
                { color: isCancelingAtPeriodEnd ? colors.warning : isTrialing ? colors.primary : isFullyExpired ? colors.muted : colors.success },
              ]}
            >
              {isCancelingAtPeriodEnd ? "Canceling" : isFullyExpired ? "Expired" : subStatus.replace(/_/g, " ")}
            </Text>
            {parsedDate.formatted ? (
              <Text style={[styles.dateText, { color: colors.muted }]}>
                {isCancelingAtPeriodEnd
                  ? `Access ends ${parsedDate.formatted}`
                  : isTrialing
                  ? `Trial ends ${parsedDate.formatted}`
                  : isPaidActive
                  ? `Renews ${parsedDate.formatted}`
                  : `Period ended ${parsedDate.formatted}`}
              </Text>
            ) : null}
          </View>

          <View style={styles.actionRow}>
            <Pressable
              style={[styles.button, { backgroundColor: colors.primary, flex: 1 }]}
              onPress={() => router.push("/pricing")}
              accessibilityRole="button"
              accessibilityLabel="View plans"
            >
              <Text style={styles.buttonText}>View plans</Text>
            </Pressable>

            {canCancel ? (
              <Pressable
                style={[
                  styles.button,
                  styles.cancelButton,
                  { borderColor: colors.danger },
                  loadingCancel && styles.buttonDisabled,
                ]}
                onPress={handleCancelPress}
                disabled={loadingCancel}
                accessibilityRole="button"
                accessibilityLabel="Cancel subscription at period end"
                accessibilityState={{ disabled: loadingCancel, busy: loadingCancel }}
              >
                {loadingCancel ? (
                  <ActivityIndicator size="small" color={colors.danger} />
                ) : (
                  <Text style={[styles.cancelButtonText, { color: colors.danger }]}>Cancel sub</Text>
                )}
              </Pressable>
            ) : null}
          </View>
        </View>

        <View style={styles.balanceGrid}>
          {[
            ["Monthly content", balances?.monthly_content_credits ?? 0],
            ["Purchased", balances?.purchased_credits ?? 0],
            ["Regeneration", balances?.monthly_regen_credits ?? 0],
          ].map(([label, value]) => (
            <View key={String(label)} style={[styles.balance, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.balanceValue, { color: colors.text }]}>{value}</Text>
              <Text style={[styles.label, { color: colors.muted }]}>{label}</Text>
            </View>
          ))}
        </View>

        <Text style={[styles.heading, { color: colors.text }]}>Credit usage history</Text>
        {(usage.data?.entries || []).map((entry) => (
          <View key={entry.id} style={[styles.row, { borderColor: colors.border }]}>
            <View style={styles.rowText}>
              <Text style={[styles.reason, { color: colors.text }]}>{entry.reason.replace(/_/g, " ")}</Text>
              <Text style={[styles.label, { color: colors.muted }]}>{new Date(entry.created_at).toLocaleString()} · {entry.pool}</Text>
            </View>
            <Text style={[styles.amount, { color: entry.amount >= 0 ? colors.success : colors.warning }]}>
              {entry.amount > 0 ? "+" : ""}{entry.amount}
            </Text>
          </View>
        ))}
        {!usage.isLoading && !usage.data?.entries?.length ? <Text style={[styles.empty, { color: colors.muted }]}>No credit activity yet.</Text> : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 40, gap: 16 },
  card: { borderWidth: 1, borderRadius: 18, padding: 18, gap: 8 },
  banner: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 4 },
  bannerTitle: { fontWeight: "700", fontSize: 15 },
  bannerText: { fontSize: 13, lineHeight: 18 },
  label: { fontSize: 13, textTransform: "capitalize" },
  plan: { fontSize: 26, fontWeight: "800" },
  statusRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 6 },
  statusBadge: { fontSize: 14, fontWeight: "700", textTransform: "capitalize" },
  dateText: { fontSize: 13 },
  actionRow: { flexDirection: "row", gap: 10, marginTop: 8 },
  button: { borderRadius: 10, minHeight: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: 12 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontWeight: "700" },
  cancelButton: { borderWidth: 1, backgroundColor: "transparent" },
  cancelButtonText: { fontWeight: "700" },
  balanceGrid: { flexDirection: "row", gap: 8 },
  balance: { flex: 1, borderWidth: 1, borderRadius: 14, padding: 12, minHeight: 90 },
  balanceValue: { fontSize: 24, fontWeight: "800", marginBottom: 6 },
  heading: { fontSize: 19, fontWeight: "800", marginTop: 8 },
  row: { borderBottomWidth: 1, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 12 },
  rowText: { flex: 1, gap: 3 },
  reason: { fontSize: 14, fontWeight: "600", textTransform: "capitalize" },
  amount: { fontSize: 16, fontWeight: "800" },
  empty: { textAlign: "center", paddingVertical: 24 },
});
