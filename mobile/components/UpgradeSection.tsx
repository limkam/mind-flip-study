import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";

import { isFreeTier, startCheckout, subscriptionLabel } from "../lib/billing";
import { useTheme } from "../hooks/useTheme";
import { hapticImpact } from "../lib/haptics";
import { getApiErrorMessage } from "../lib/apiErrors";

type Props = {
  subscriptionTier?: string | null;
};

export function UpgradeSection({ subscriptionTier }: Props) {
  const { colors } = useTheme();
  const [loadingPlan, setLoadingPlan] = useState<"basic" | "premium" | null>(null);

  const checkout = async (plan: "basic" | "premium") => {
    setLoadingPlan(plan);
    try {
      await startCheckout(plan);
    } catch (e: unknown) {
      Alert.alert("Checkout unavailable", getApiErrorMessage(e, "Could not start checkout."));
    } finally {
      setLoadingPlan(null);
    }
  };

  if (!isFreeTier(subscriptionTier)) {
    return (
      <View style={[styles.activeCard, { backgroundColor: colors.primary + "12", borderColor: colors.primary + "40" }]}>
        <Text style={[styles.activeTitle, { color: colors.text }]}>
          {subscriptionLabel(subscriptionTier)} plan active
        </Text>
        <Text style={[styles.activeHint, { color: colors.muted }]}>
          You have full access to uploads, flashcards, and premium study features.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.plans}>
      <Text style={[styles.heading, { color: colors.text }]}>Upgrade your plan</Text>
      <Text style={[styles.sub, { color: colors.muted }]}>
        Unlock unlimited uploads, sets, and cards. Cancel anytime from your Stripe receipt.
      </Text>
      <Pressable
        style={[styles.planBtn, { backgroundColor: colors.primary }]}
        disabled={!!loadingPlan}
        onPress={() => {
          void hapticImpact("light");
          void checkout("basic");
        }}
      >
        {loadingPlan === "basic" ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.planBtnText}>Student — $3.99/mo</Text>
        )}
      </Pressable>
      <Pressable
        style={[styles.planBtnOutline, { borderColor: colors.border }]}
        disabled={!!loadingPlan}
        onPress={() => {
          void hapticImpact("light");
          void checkout("premium");
        }}
      >
        {loadingPlan === "premium" ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <Text style={[styles.planBtnOutlineText, { color: colors.text }]}>Premium — $7.99/mo</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  plans: { gap: 10 },
  heading: { fontSize: 16, fontWeight: "700" },
  sub: { fontSize: 14, lineHeight: 20 },
  planBtn: {
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    minHeight: 44,
    justifyContent: "center",
  },
  planBtnText: { color: "#fff", fontWeight: "600", fontSize: 15 },
  planBtnOutline: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    minHeight: 44,
    justifyContent: "center",
  },
  planBtnOutlineText: { fontWeight: "600", fontSize: 15 },
  activeCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 6,
  },
  activeTitle: { fontSize: 16, fontWeight: "700" },
  activeHint: { fontSize: 14, lineHeight: 20 },
});
