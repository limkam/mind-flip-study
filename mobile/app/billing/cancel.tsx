import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Screen } from "../../components/Screen";
import { useTheme } from "../../hooks/useTheme";
import { subscriptionsEnabled } from "../../lib/billing";

export default function BillingCancelScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const isSubscriptionsEnabled = subscriptionsEnabled();

  return (
    <Screen edges={["bottom"]}>
      <Stack.Screen options={{ title: "Checkout canceled" }} />
      <View style={styles.container}>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.iconWrapper, { backgroundColor: colors.muted + "20" }]}>
            <Ionicons name="information-circle-outline" size={48} color={colors.muted} />
          </View>
          <Text style={[styles.title, { color: colors.text }]}>Checkout canceled</Text>
          <Text style={[styles.sub, { color: colors.muted }]}>
            You left the checkout process. No charges were made.
          </Text>

          <View style={styles.actions}>
            <Pressable
              style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
              onPress={() => router.replace(isSubscriptionsEnabled ? "/pricing" : "/billing")}
            >
              <Text style={styles.primaryBtnText}>
                {isSubscriptionsEnabled ? "Return to Plans" : "Return to Billing"}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.secondaryBtn, { borderColor: colors.border }]}
              onPress={() => router.replace("/billing")}
            >
              <Text style={[styles.secondaryBtnText, { color: colors.text }]}>Open Billing & Usage</Text>
            </Pressable>
          </View>
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
  actions: { width: "100%", gap: 10, marginTop: 12 },
  primaryBtn: { paddingHorizontal: 24, paddingVertical: 14, borderRadius: 12, alignItems: "center" },
  primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  secondaryBtn: { borderWidth: 1, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 12, alignItems: "center" },
  secondaryBtnText: { fontWeight: "700", fontSize: 16 },
});
