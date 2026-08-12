import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import { ActivityIndicator, Alert, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import { BuyCreditsModal } from "../components/billing/BuyCreditsModal";
import { Screen } from "../components/Screen";
import { useTheme } from "../hooks/useTheme";
import { getApiErrorMessage } from "../lib/apiErrors";
import {
  cancelSubscriptionAtPeriodEnd,
  fetchCreditPurchaseHistory,
  fetchCreditUsage,
  fetchEntitlementsSnapshot,
  formatCurrency,
  formatExpiryText,
  getCreditReasonLabel,
} from "../lib/billing";
import { useAuthStore } from "../store/authStore";
import type { CreditActivityFilter } from "../types/api";

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
  try {
    const formatted = new Date(ms).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
    return { formatted, isPast: ms < Date.now() };
  } catch {
    return { formatted: null, isPast: false };
  }
}

function getEmptyStateText(filter: CreditActivityFilter): string {
  switch (filter) {
    case "usage":
      return "No usage activity yet.";
    case "allowances":
      return "No allowance activity yet.";
    case "purchases":
      return "No purchase activity yet.";
    default:
      return "No credit activity yet.";
  }
}

export default function BillingScreen() {
  const router = useRouter();
  const { colors } = useTheme();

  const user = useAuthStore((state) => state.user);

  const mountedRef = useRef(true);
  const cancellationLockRef = useRef<{
    phase: "confirming" | "executing";
    attemptId: number;
    userId: string;
    planSlug: string;
  } | null>(null);
  const attemptSeqRef = useRef(0);
  const refreshingRef = useRef(false);

  const [loadingCancel, setLoadingCancel] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelSuccessMsg, setCancelSuccessMsg] = useState<string | null>(null);
  const [buyCreditsModalVisible, setBuyCreditsModalVisible] = useState(false);
  const [activityFilter, setActivityFilter] = useState<CreditActivityFilter>("all");
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cancellationLockRef.current = null;
      refreshingRef.current = false;
    };
  }, []);

  const entitlements = useQuery({
    queryKey: ["billing-entitlements"],
    queryFn: fetchEntitlementsSnapshot,
  });

  const usage = useQuery({
    queryKey: ["credit-usage"],
    queryFn: fetchCreditUsage,
  });

  const purchaseHistory = useQuery({
    queryKey: ["credit-purchase-history"],
    queryFn: fetchCreditPurchaseHistory,
  });

  const handleRefresh = async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    try {
      await Promise.allSettled([
        entitlements.refetch(),
        usage.refetch(),
        purchaseHistory.refetch(),
      ]);
    } finally {
      if (mountedRef.current) {
        setRefreshing(false);
        refreshingRef.current = false;
      }
    }
  };

  const plan = entitlements.data;
  const balances = plan?.balances;
  const planSlug = plan?.plan_slug || "free";
  const subStatus = plan?.subscription_status || "free";
  const renewalOrEndDate = plan?.renewal_or_end_date;
  const parsedDate = parseAndFormatDate(renewalOrEndDate);

  const isConflict = subStatus === "subscription_conflict";
  const isPlanUnavailable = entitlements.isError && !entitlements.data;
  const isFree = subStatus === "free" && planSlug === "free";
  const isPaidActive = subStatus === "active" && planSlug !== "free";
  const hasLegacyActiveAccess = subStatus === "trialing";
  const isCanceledStatus = subStatus === "canceled";

  const accessUsable = planSlug !== "free" && !parsedDate.isPast;
  const isCancelingAtPeriodEnd = isCanceledStatus && accessUsable;
  const isFullyExpired = isCanceledStatus && parsedDate.isPast;
  const canCancel = (isPaidActive || hasLegacyActiveAccess) && accessUsable && !isConflict && !entitlements.isLoading;

  const hasDiscardedRows = (usage.data?.discarded_count || 0) > 0 || (purchaseHistory.data?.discarded_count || 0) > 0;

  const filteredUsageEntries = useMemo(() => {
    const entries = usage.data?.entries || [];
    return entries.filter((entry) => {
      if (activityFilter === "all") return true;
      if (activityFilter === "usage") return entry.amount < 0;
      if (activityFilter === "allowances") {
        return (
          entry.reason.includes("allowance") ||
          entry.reason === "signup_free_grant"
        );
      }
      if (activityFilter === "purchases") return entry.reason === "purchased_credits";
      return true;
    });
  }, [usage.data?.entries, activityFilter]);

  const handleCancelPress = () => {
    if (!canCancel || !user?.id || loadingCancel || cancellationLockRef.current !== null || entitlements.isFetching) {
      return;
    }

    attemptSeqRef.current += 1;
    const currentAttemptId = attemptSeqRef.current;
    cancellationLockRef.current = {
      phase: "confirming",
      attemptId: currentAttemptId,
      userId: user.id,
      planSlug,
    };

    Alert.alert("Cancel subscription?", "Your subscription will not renew. You will keep access until the end of the current billing period.", [
      { text: "Keep subscription", style: "cancel", onPress: () => { cancellationLockRef.current = null; } },
      { text: "Cancel at period end", style: "destructive", onPress: () => executeCancellation(currentAttemptId, user.id, planSlug) },
    ]);
  };

  const executeCancellation = async (attemptId: number, capturedUserId: string, capturedPlanSlug: string) => {
    const latestUser = useAuthStore.getState().user;
    if (
      !mountedRef.current ||
      !latestUser?.id ||
      latestUser.id !== capturedUserId ||
      cancellationLockRef.current?.attemptId !== attemptId
    ) {
      if (cancellationLockRef.current?.attemptId === attemptId) {
        cancellationLockRef.current = null;
      }
      return;
    }

    cancellationLockRef.current.phase = "executing";
    setLoadingCancel(true);
    setCancelError(null);
    setCancelSuccessMsg(null);

    try {
      await cancelSubscriptionAtPeriodEnd();

      if (!mountedRef.current) return;
      const currentUser = useAuthStore.getState().user;
      if (currentUser?.id !== capturedUserId) {
        setCancelError("Account context changed during request.");
        return;
      }

      setCancelSuccessMsg("Subscription cancellation scheduled. Your access remains active until the end of your billing period.");
      await entitlements.refetch();
    } catch (err) {
      if (!mountedRef.current) return;
      const msg = getApiErrorMessage(err, "Failed to cancel subscription. Please try again.");
      setCancelError(msg);
    } finally {
      if (mountedRef.current) {
        setLoadingCancel(false);
      }
      if (cancellationLockRef.current?.attemptId === attemptId) {
        cancellationLockRef.current = null;
      }
    }
  };

  const totalPurchases = purchaseHistory.data?.total_purchases || 0;
  const validPurchaseCount = purchaseHistory.data?.purchases?.length || 0;
  const purchaseCountText = validPurchaseCount < totalPurchases
    ? `Showing ${validPurchaseCount} of ${totalPurchases} purchases`
    : `${totalPurchases} ${totalPurchases === 1 ? "purchase" : "purchases"}`;

  return (
    <Screen style={{ backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: "Billing & Credits" }} />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      >
        {cancelSuccessMsg ? (
          <View style={[styles.banner, { backgroundColor: colors.success + "15", borderColor: colors.success }]}>
            <Text style={[styles.bannerTitle, { color: colors.success }]}>Cancellation scheduled</Text>
            <Text style={[styles.bannerText, { color: colors.text }]}>{cancelSuccessMsg}</Text>
          </View>
        ) : null}

        {cancelError ? (
          <View style={[styles.banner, { backgroundColor: colors.danger + "15", borderColor: colors.danger }]}>
            <Text style={[styles.bannerTitle, { color: colors.danger }]}>Error</Text>
            <Text style={[styles.bannerText, { color: colors.text }]}>{cancelError}</Text>
          </View>
        ) : null}

        {hasDiscardedRows ? (
          <View style={[styles.banner, { backgroundColor: colors.warning + "15", borderColor: colors.warning }]}>
            <Text style={[styles.bannerTitle, { color: colors.warning }]}>Some activity is unavailable</Text>
            <Text style={[styles.bannerText, { color: colors.text }]}>
              Some credit or purchase records could not be displayed.
            </Text>
          </View>
        ) : null}

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.label, { color: colors.muted }]}>Current Plan</Text>

          {entitlements.isLoading ? (
            <ActivityIndicator size="small" color={colors.primary} style={{ alignSelf: "flex-start" }} />
          ) : (
            <Text style={[styles.plan, { color: colors.text }]}>
              {isPlanUnavailable
                ? "Plan details unavailable"
                : isConflict
                  ? "Subscription Review Required"
                  : PLAN_NAMES[planSlug] || planSlug}
            </Text>
          )}

          {isConflict ? (
            <Text style={[styles.conflictText, { color: colors.danger }]}>
              We found more than one active subscription on this account. New checkout and cancellation are unavailable while this is resolved. Please contact support.
            </Text>
          ) : null}

          {!isConflict && !isPlanUnavailable && !entitlements.isLoading ? (
            <View style={styles.statusRow}>
              <Text
                style={[
                  styles.statusBadge,
                  {
                    color: isPaidActive
                      ? colors.success
                      : hasLegacyActiveAccess
                      ? colors.primary
                      : isCancelingAtPeriodEnd
                      ? colors.warning
                      : colors.muted,
                  },
                ]}
              >
                {isCancelingAtPeriodEnd
                  ? "Cancellation Scheduled"
                  : isFree
                  ? "Free"
                  : hasLegacyActiveAccess
                  ? "Active"
                  : isPaidActive
                  ? "Active Paid"
                  : isFullyExpired
                  ? "Ended"
                  : subStatus}
              </Text>

              {parsedDate.formatted ? (
                <Text style={[styles.renewalDate, { color: colors.muted }]}>
                  {isCancelingAtPeriodEnd
                    ? `Ends ${parsedDate.formatted}`
                    : hasLegacyActiveAccess
                    ? `Ends ${parsedDate.formatted}`
                    : isPaidActive
                    ? `Renews ${parsedDate.formatted}`
                    : `Ended ${parsedDate.formatted}`}
                </Text>
              ) : null}
            </View>
          ) : null}

          <View style={styles.buttonRow}>
            {!isConflict ? (
              <Pressable
                style={[styles.button, { backgroundColor: colors.primary }]}
                onPress={() => router.push("/pricing")}
                accessibilityRole="button"
                accessibilityLabel="View plans"
              >
                <Text style={[styles.buttonText, { color: colors.onPrimary }]}>View plans</Text>
              </Pressable>
            ) : null}

            {canCancel ? (
              <Pressable
                style={[styles.button, styles.cancelButton, { borderColor: colors.danger }]}
                onPress={handleCancelPress}
                disabled={loadingCancel}
              >
                {loadingCancel ? (
                  <ActivityIndicator size="small" color={colors.danger} />
                ) : (
                  <Text style={[styles.cancelButtonText, { color: colors.danger }]}>Cancel plan</Text>
                )}
              </Pressable>
            ) : null}
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={[styles.heading, { color: colors.text }]}>Credit balances</Text>
          <Pressable
            style={[styles.buyCreditsButton, { backgroundColor: colors.primary }]}
            onPress={() => setBuyCreditsModalVisible(true)}
          >
            <Text style={[styles.buyCreditsButtonText, { color: colors.onPrimary }]}>Buy credits</Text>
          </Pressable>
        </View>

        {entitlements.isLoading && !entitlements.data ? (
          <View style={[styles.card, { alignItems: "center", paddingVertical: 24 }]}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.label, { color: colors.muted }]}>Total available</Text>
              <Text style={[styles.balanceValue, { color: colors.text }]}>{balances?.available_total ?? 0} credits</Text>
            </View>
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.reason, { color: colors.text }]}>Plan credits</Text>
              <View style={styles.balanceGrid}>
                {[["Included", balances?.plan_allocated_credits ?? 0], ["Used", balances?.plan_used_credits ?? 0], ["Remaining", balances?.monthly_content_credits ?? 0]].map(([label, value]) => <View key={String(label)} style={styles.balanceMetric}><Text style={[styles.balanceValue, { color: colors.text }]}>{value}</Text><Text style={[styles.label, { color: colors.muted }]}>{label}</Text></View>)}
              </View>
              <Text style={[styles.label, { color: colors.muted }]}>Plan credits are consumed first and reset with their plan cycle.</Text>
            </View>
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.reason, { color: colors.text }]}>Purchased credits</Text>
              {(balances?.purchased_total_credits ?? 0) === 0 ? <Text style={[styles.label, { color: colors.muted }]}>You haven&apos;t purchased any extra credits yet.</Text> : null}
              <View style={styles.balanceGrid}>
                {[["Purchased", balances?.purchased_total_credits ?? 0], ["Used", balances?.purchased_used_credits ?? 0], ["Remaining", balances?.purchased_credits ?? 0]].map(([label, value]) => <View key={String(label)} style={styles.balanceMetric}><Text style={[styles.balanceValue, { color: colors.text }]}>{value}</Text><Text style={[styles.label, { color: colors.muted }]}>{label}</Text></View>)}
              </View>
              <Text style={[styles.label, { color: colors.muted }]}>Purchased credits never expire and survive renewal, downgrade, or cancellation.</Text>
            </View>
          </View>
        )}

        <BuyCreditsModal
          visible={buyCreditsModalVisible}
          onClose={() => setBuyCreditsModalVisible(false)}
        />

        <View style={styles.sectionHeader}>
          <Text style={[styles.heading, { color: colors.text }]}>Credit activity</Text>
        </View>

        <View style={[styles.filterContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {(["all", "usage", "allowances", "purchases"] as CreditActivityFilter[]).map((f) => (
            <Pressable
              key={f}
              style={[styles.filterTab, activityFilter === f && { backgroundColor: colors.primary }]}
              onPress={() => setActivityFilter(f)}
            >
              <Text style={[styles.filterTabText, { color: activityFilter === f ? colors.onPrimary : colors.muted }]}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </Text>
            </Pressable>
          ))}
        </View>

        {usage.isLoading && !usage.data ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        ) : usage.isError && !usage.data ? (
          <View style={[styles.errorCard, { borderColor: colors.danger }]}>
            <Text style={[styles.errorText, { color: colors.danger }]}>Unable to load credit activity.</Text>
            <Pressable style={[styles.retryButton, { backgroundColor: colors.primary }]} onPress={() => usage.refetch()}>
              <Text style={styles.retryButtonText}>Retry</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {filteredUsageEntries.map((entry) => {
              const reasonLabel = getCreditReasonLabel(entry.reason);
              const isPositive = entry.amount >= 0;
              const formattedDate = parseAndFormatDate(entry.created_at).formatted;
              const formattedExpiry = formatExpiryText(entry.expires_at);
              const absAmount = Math.abs(entry.amount);

              return (
                <View key={entry.id} style={[styles.row, { borderColor: colors.border }]}>
                  <View style={styles.rowText}>
                    <Text style={[styles.reason, { color: colors.text }]}>{reasonLabel}</Text>
                    <Text style={[styles.label, { color: colors.muted }]}>
                      {formattedDate || entry.created_at} · Pool: {entry.pool}
                      {formattedExpiry ? ` · ${formattedExpiry}` : ""}
                    </Text>
                  </View>
                  <Text style={[styles.amount, { color: isPositive ? colors.success : colors.warning }]}>
                    {isPositive ? "+" : "−"}{absAmount} {absAmount === 1 ? "credit" : "credits"}
                  </Text>
                </View>
              );
            })}
            {!filteredUsageEntries.length ? (
              <Text style={[styles.empty, { color: colors.muted }]}>{getEmptyStateText(activityFilter)}</Text>
            ) : null}
          </>
        )}

        <View style={styles.sectionHeader}>
          <Text style={[styles.heading, { color: colors.text }]}>Purchase history</Text>
          {purchaseHistory.data ? (
            <Text style={[styles.subheading, { color: colors.muted }]}>{purchaseCountText}</Text>
          ) : null}
        </View>

        {purchaseHistory.isLoading && !purchaseHistory.data ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        ) : purchaseHistory.isError && !purchaseHistory.data ? (
          <View style={[styles.errorCard, { borderColor: colors.danger }]}>
            <Text style={[styles.errorText, { color: colors.danger }]}>Unable to load purchase history.</Text>
            <Pressable style={[styles.retryButton, { backgroundColor: colors.primary }]} onPress={() => purchaseHistory.refetch()}>
              <Text style={styles.retryButtonText}>Retry</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {(purchaseHistory.data?.purchases || []).map((p) => {
              const formattedDate = parseAndFormatDate(p.created_at).formatted;
              const totalPaidFormatted = formatCurrency(p.amount_paid_cents, p.currency) || `${p.currency.toUpperCase()} ${(p.amount_paid_cents / 100).toFixed(2)}`;
              const unitPriceFormatted = formatCurrency(p.unit_price_cents, p.currency) || `${p.currency.toUpperCase()} ${(p.unit_price_cents / 100).toFixed(2)}`;
              const statusCapitalized = p.status ? p.status.charAt(0).toUpperCase() + p.status.slice(1) : "Completed";

              return (
                <View key={p.id} style={[styles.purchaseCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={styles.purchaseHeader}>
                    <Text style={[styles.purchaseQuantity, { color: colors.text }]}>
                      {p.quantity} {p.quantity === 1 ? "credit" : "credits"}
                    </Text>
                    <Text style={[styles.purchaseStatus, { color: colors.success }]}>
                      {statusCapitalized}
                    </Text>
                  </View>
                  <View style={styles.purchaseDetails}>
                    <Text style={[styles.purchaseAmount, { color: colors.text }]}>
                      {totalPaidFormatted} total
                    </Text>
                    <Text style={[styles.purchaseSubtext, { color: colors.muted }]}>
                      {unitPriceFormatted} per credit · {formattedDate || p.created_at}
                    </Text>
                    {p.receipt_url ? (
                      <Pressable onPress={() => void Linking.openURL(p.receipt_url!)} accessibilityRole="link">
                        <Text style={[styles.purchaseSubtext, { color: colors.primary, fontWeight: "700" }]}>View Stripe receipt</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              );
            })}
            {!purchaseHistory.isLoading && !purchaseHistory.data?.purchases?.length ? (
              <Text style={[styles.empty, { color: colors.muted }]}>No credit purchases yet.</Text>
            ) : null}
          </>
        )}
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
  balanceMetric: { flex: 1, minWidth: 80 },
  plan: { fontSize: 26, fontWeight: "800" },
  statusRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 6 },
  statusBadge: { fontSize: 14, fontWeight: "700", textTransform: "capitalize" },
  renewalDate: { fontSize: 13 },
  dateText: { fontSize: 13 },
  conflictText: { fontSize: 13, fontWeight: "600" },
  buttonRow: { flexDirection: "row", gap: 10, marginTop: 8 },
  actionRow: { flexDirection: "row", gap: 10, marginTop: 8 },
  button: { borderRadius: 10, minHeight: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: 12 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { fontWeight: "700" },
  cancelButton: { borderWidth: 1, backgroundColor: "transparent" },
  cancelButtonText: { fontWeight: "700" },
  balanceGrid: { flexDirection: "row", gap: 8 },
  balance: { flex: 1, borderWidth: 1, borderRadius: 14, padding: 12, minHeight: 90 },
  balanceValue: { fontSize: 24, fontWeight: "800", marginBottom: 6 },
  infoNote: { fontSize: 12, lineHeight: 16 },
  heading: { fontSize: 19, fontWeight: "800", marginTop: 8 },
  subheading: { fontSize: 13, fontWeight: "600" },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 },
  buyCreditsButton: { borderRadius: 8, minHeight: 44, paddingHorizontal: 12, justifyContent: "center", alignItems: "center" },
  buyCreditsButtonText: { fontWeight: "700", fontSize: 13 },
  filterContainer: { flexDirection: "row", borderWidth: 1, borderRadius: 12, padding: 4, gap: 4 },
  filterTab: { flex: 1, minHeight: 44, paddingHorizontal: 4, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  filterTabText: { fontSize: 13, fontWeight: "600" },
  row: { borderBottomWidth: 1, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 12 },
  rowText: { flex: 1, gap: 3 },
  reason: { fontSize: 14, fontWeight: "600" },
  amount: { fontSize: 15, fontWeight: "800" },
  empty: { textAlign: "center", paddingVertical: 20, fontSize: 14 },
  loadingContainer: { paddingVertical: 20, alignItems: "center" },
  errorCard: { borderWidth: 1, borderRadius: 12, padding: 16, alignItems: "center", gap: 10, marginVertical: 8 },
  errorText: { fontSize: 14, fontWeight: "600" },
  retryButton: { borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8 },
  retryButtonText: { color: "#ffffff", fontWeight: "700", fontSize: 13 },
  purchaseCard: { borderWidth: 1, borderRadius: 14, padding: 16, gap: 8 },
  purchaseHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  purchaseQuantity: { fontSize: 16, fontWeight: "700" },
  purchaseStatus: { fontSize: 13, fontWeight: "700" },
  purchaseDetails: { gap: 2 },
  purchaseAmount: { fontSize: 15, fontWeight: "700" },
  purchaseSubtext: { fontSize: 13 },
});
