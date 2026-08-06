import React, { useEffect, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { Screen } from "../../../components/Screen";
import { useTheme } from "../../../hooks/useTheme";
import { fetchCreditPurchaseHistory, fetchCreditUsage, fetchEntitlementsSnapshot, verifyCheckoutSession } from "../../../lib/billing";
import { getCheckoutAttempt, releaseCheckoutAttempt } from "../../../lib/checkoutAttempt";
import { mobileQueryClient } from "../../../lib/queryClient";
import { useAuthStore } from "../../../store/authStore";

type VerificationStep =
  | "verifying"
  | "applying"
  | "credited"
  | "processing"
  | "sync_failed"
  | "error";

export default function CreditSuccessScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ session_id?: string }>();
  const rawSessionId = params.session_id;

  const [step, setStep] = useState<VerificationStep>("verifying");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [purchasedQuantity, setPurchasedQuantity] = useState<number | null>(null);
  const [resultingBalance, setResultingBalance] = useState<number | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefreshSync = async () => {
    setIsRefreshing(true);
    try {
      const [entitlements, usageData, purchaseHistoryData] = await Promise.all([
        fetchEntitlementsSnapshot(),
        fetchCreditUsage(),
        fetchCreditPurchaseHistory(),
      ]);
      mobileQueryClient.setQueryData(["billing-entitlements"], entitlements);
      mobileQueryClient.setQueryData(["credit-usage"], usageData);
      mobileQueryClient.setQueryData(["credit-purchase-history"], purchaseHistoryData);
      setResultingBalance(entitlements.balances?.purchased_credits ?? null);
      setStep("credited");
    } catch (err: unknown) {
      setErrorMessage("Could not refresh account balance. Please check your connection.");
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    let active = true;

    async function runReconciliation() {
      if (!rawSessionId || typeof rawSessionId !== "string" || !rawSessionId.startsWith("cs_")) {
        if (active) {
          setStep("error");
          setErrorMessage("Invalid checkout session link.");
        }
        return;
      }

      const currentUser = useAuthStore.getState().user;
      if (!currentUser?.id) {
        if (active) {
          setStep("error");
          setErrorMessage("User session expired during verification.");
        }
        return;
      }

      // Max 5 attempts at 2s intervals
      const maxAttempts = 5;
      const intervalMs = 2000;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        if (!active) return;

        try {
          const res = await verifyCheckoutSession(rawSessionId);

          if (res.checkout_kind !== "credit_purchase") {
            if (active) {
              setStep("error");
              setErrorMessage("Mismatched checkout type for credit verification.");
            }
            return;
          }

          if (res.credit_quantity !== null) {
            setPurchasedQuantity(res.credit_quantity);
          }

          if (res.purchase_state === "credited") {
            if (active) setStep("applying");

            // Release checkout lock immediately upon server confirmation of credit grant
            const currentLock = getCheckoutAttempt();
            if (currentLock) {
              releaseCheckoutAttempt(currentLock.attemptId, currentUser.id);
            }

            // Refetch & synchronize authoritative entitlements, credit usage, and purchase history
            try {
              const [entitlements, usageData, purchaseHistoryData] = await Promise.all([
                fetchEntitlementsSnapshot(),
                fetchCreditUsage(),
                fetchCreditPurchaseHistory(),
              ]);

              if (!active) return;

              mobileQueryClient.setQueryData(["billing-entitlements"], entitlements);
              mobileQueryClient.setQueryData(["credit-usage"], usageData);
              mobileQueryClient.setQueryData(["credit-purchase-history"], purchaseHistoryData);

              const extraBalance = entitlements.balances?.purchased_credits ?? null;
              setResultingBalance(extraBalance);

              setStep("credited");
              return;
            } catch (syncErr) {
              if (active) {
                setStep("sync_failed");
                return;
              }
            }
          } else if (res.purchase_state === "processing" || res.checkout_status === "complete") {
            if (attempt === maxAttempts) {
              if (active) setStep("processing");
              return;
            }
          } else if (res.checkout_status === "expired" || res.purchase_state === "not_confirmed") {
            if (active) {
              setStep("error");
              setErrorMessage("Checkout session was expired or not confirmed.");
            }
            return;
          }
        } catch (err: unknown) {
          if (attempt === maxAttempts && active) {
            setStep("error");
            setErrorMessage(err instanceof Error ? err.message : "Verification failed.");
            return;
          }
        }

        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }
    }

    void runReconciliation();

    return () => {
      active = false;
    };
  }, [rawSessionId]);

  return (
    <Screen style={styles.screen}>
      <View style={styles.container}>
        {step === "verifying" || step === "applying" ? (
          <View style={styles.card}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.title, { color: colors.text }]}>
              {step === "verifying" ? "Verifying credit purchase..." : "Applying credits..."}
            </Text>
            <Text style={[styles.subtitle, { color: colors.muted }]}>
              Checking your payment status with Stripe. Please wait a moment.
            </Text>
          </View>
        ) : step === "credited" ? (
          <View style={styles.card}>
            <View style={[styles.iconCircle, { backgroundColor: `${colors.success}15` }]}>
              <Ionicons name="checkmark-circle" size={48} color={colors.success} />
            </View>
            <Text style={[styles.title, { color: colors.text }]}>Credits added!</Text>
            <Text style={[styles.subtitle, { color: colors.muted }]}>
              {purchasedQuantity !== null
                ? `Successfully added ${purchasedQuantity} credit${purchasedQuantity === 1 ? "" : "s"} to your account.`
                : "Your extra credits are now available for AI generation and flashcard tools."}
            </Text>

            {resultingBalance !== null && (
              <View style={[styles.balanceCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.balanceLabel, { color: colors.muted }]}>Purchased Credit Balance</Text>
                <Text style={[styles.balanceValue, { color: colors.primary }]}>{resultingBalance}</Text>
              </View>
            )}

            <View style={styles.actions}>
              <Pressable
                style={[styles.button, { backgroundColor: colors.primary }]}
                onPress={() => router.replace("/billing")}
              >
                <Text style={styles.buttonText}>Open Billing & Usage</Text>
              </Pressable>
              <Pressable
                style={[styles.buttonSecondary, { borderColor: colors.border }]}
                onPress={() => router.replace("/")}
              >
                <Text style={[styles.buttonSecondaryText, { color: colors.text }]}>Return to Dashboard</Text>
              </Pressable>
            </View>
          </View>
        ) : step === "sync_failed" ? (
          <View style={styles.card}>
            <View style={[styles.iconCircle, { backgroundColor: `${colors.warning}15` }]}>
              <Ionicons name="checkmark-circle" size={48} color={colors.warning} />
            </View>
            <Text style={[styles.title, { color: colors.text }]}>Credits added!</Text>
            <Text style={[styles.subtitle, { color: colors.muted }]}>
              Your purchase succeeded, but displaying your updated balance failed. Tap below to refresh your account balance.
            </Text>

            <View style={styles.actions}>
              <Pressable
                style={[styles.button, { backgroundColor: colors.primary }]}
                onPress={() => void handleRefreshSync()}
                disabled={isRefreshing}
              >
                {isRefreshing ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.buttonText}>Refresh Balance</Text>
                )}
              </Pressable>
              <Pressable
                style={[styles.buttonSecondary, { borderColor: colors.border }]}
                onPress={() => router.replace("/billing")}
              >
                <Text style={[styles.buttonSecondaryText, { color: colors.text }]}>Open Billing & Usage</Text>
              </Pressable>
            </View>
          </View>
        ) : step === "processing" ? (
          <View style={styles.card}>
            <View style={[styles.iconCircle, { backgroundColor: `${colors.warning}15` }]}>
              <Ionicons name="time" size={48} color={colors.warning} />
            </View>
            <Text style={[styles.title, { color: colors.text }]}>Still processing</Text>
            <Text style={[styles.subtitle, { color: colors.muted }]}>
              Your payment was completed, but your credits are still being applied.
            </Text>

            <View style={styles.actions}>
              <Pressable
                style={[styles.button, { backgroundColor: colors.primary }]}
                onPress={() => router.replace("/billing")}
              >
                <Text style={styles.buttonText}>Open Billing & Usage</Text>
              </Pressable>
              <Pressable
                style={[styles.buttonSecondary, { borderColor: colors.border }]}
                onPress={() => router.replace("/")}
              >
                <Text style={[styles.buttonSecondaryText, { color: colors.text }]}>Return to Dashboard</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={styles.card}>
            <View style={[styles.iconCircle, { backgroundColor: `${colors.danger}15` }]}>
              <Ionicons name="alert-circle" size={48} color={colors.danger} />
            </View>
            <Text style={[styles.title, { color: colors.text }]}>Unable to confirm</Text>
            <Text style={[styles.subtitle, { color: colors.muted }]}>
              {errorMessage || "We could not confirm your credit purchase. Please check your billing screen."}
            </Text>

            <View style={styles.actions}>
              <Pressable
                style={[styles.button, { backgroundColor: colors.primary }]}
                onPress={() => router.replace("/billing")}
              >
                <Text style={styles.buttonText}>Open Billing & Usage</Text>
              </Pressable>
              <Pressable
                style={[styles.buttonSecondary, { borderColor: colors.border }]}
                onPress={() => router.replace("/")}
              >
                <Text style={[styles.buttonSecondaryText, { color: colors.text }]}>Return to Dashboard</Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  container: { flex: 1, padding: 24, justifyContent: "center", alignItems: "center" },
  card: { width: "100%", maxWidth: 400, alignItems: "center", padding: 24, gap: 12 },
  iconCircle: { width: 80, height: 80, borderRadius: 40, justifyContent: "center", alignItems: "center", marginBottom: 8 },
  title: { fontSize: 22, fontWeight: "800", textAlign: "center" },
  subtitle: { fontSize: 14, textAlign: "center", lineHeight: 20 },
  balanceCard: { width: "100%", padding: 16, borderRadius: 12, borderWidth: 1, alignItems: "center", marginVertical: 8 },
  balanceLabel: { fontSize: 13, textTransform: "uppercase", fontWeight: "600" },
  balanceValue: { fontSize: 28, fontWeight: "800", marginTop: 4 },
  actions: { width: "100%", gap: 10, marginTop: 16 },
  button: { height: 48, borderRadius: 12, justifyContent: "center", alignItems: "center" },
  buttonText: { color: "#ffffff", fontWeight: "700", fontSize: 15 },
  buttonSecondary: { height: 48, borderRadius: 12, borderWidth: 1, justifyContent: "center", alignItems: "center" },
  buttonSecondaryText: { fontWeight: "600", fontSize: 15 },
});
