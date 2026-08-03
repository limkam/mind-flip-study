import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { type ReactNode, useEffect, useRef } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { fetchEntitlementsSnapshot } from "../lib/billing";
import { emitUpgradeLimit } from "../lib/upgradeLimitEvents";
import { EmptyState } from "./EmptyState";
import { Screen } from "./Screen";
import { useTheme } from "../hooks/useTheme";

const CHALLENGE_UNAVAILABLE_MESSAGE = "Quiz challenges are unavailable on your current plan.";

export function ChallengeEntitlementGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { colors } = useTheme();
  const prompted = useRef(false);
  const entitlements = useQuery({
    queryKey: ["billing-entitlements"],
    queryFn: fetchEntitlementsSnapshot,
  });
  const allowed = !entitlements.isError && entitlements.data?.features.challenges === true;

  useEffect(() => {
    if (!entitlements.isPending && !entitlements.isError && !allowed && !prompted.current) {
      prompted.current = true;
      emitUpgradeLimit({ reason: CHALLENGE_UNAVAILABLE_MESSAGE });
    }
  }, [allowed, entitlements.isError, entitlements.isPending]);

  if (entitlements.isPending) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.status, { color: colors.muted }]}>Checking challenge access…</Text>
        </View>
      </Screen>
    );
  }

  if (entitlements.isError) {
    return (
      <Screen>
        <EmptyState
          icon="⚠️"
          title="Could not verify challenge access"
          message="Check your connection and try again. Other parts of MindFlip are still available."
          actionLabel="Try again"
          onAction={() => void entitlements.refetch()}
        />
      </Screen>
    );
  }

  if (!allowed) {
    return (
      <Screen>
        <EmptyState
          icon="🔒"
          title="Quiz challenges unavailable"
          message={CHALLENGE_UNAVAILABLE_MESSAGE}
          actionLabel="Back to dashboard"
          onAction={() => router.replace("/(tabs)")}
        />
      </Screen>
    );
  }

  return children;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28 },
  status: { marginTop: 12, fontSize: 14 },
});
