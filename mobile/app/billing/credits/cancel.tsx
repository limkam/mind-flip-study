import React, { useEffect } from "react";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { Screen } from "../../../components/Screen";
import { useTheme } from "../../../hooks/useTheme";
import { getCheckoutAttempt, releaseCheckoutAttempt } from "../../../lib/checkoutAttempt";
import { useAuthStore } from "../../../store/authStore";

export default function CreditCancelScreen() {
  const { colors } = useTheme();
  const router = useRouter();

  useEffect(() => {
    const user = useAuthStore.getState().user;
    if (user?.id) {
      const current = getCheckoutAttempt();
      if (current && current.kind === "credit_purchase") {
        releaseCheckoutAttempt(current.attemptId, user.id);
      }
    }
  }, []);

  return (
    <Screen style={styles.screen}>
      <View style={styles.container}>
        <View style={styles.card}>
          <View style={[styles.iconCircle, { backgroundColor: `${colors.muted}20` }]}>
            <Ionicons name="close-circle" size={48} color={colors.muted} />
          </View>
          <Text style={[styles.title, { color: colors.text }]}>Checkout closed</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>
            You returned from credit checkout without completing your order. No changes were made to your credit balance.
          </Text>

          <View style={styles.actions}>
            <Pressable
              style={[styles.button, { backgroundColor: colors.primary }]}
              onPress={() => router.replace("/billing")}
            >
              <Text style={styles.buttonText}>Return to Billing</Text>
            </Pressable>
            <Pressable
              style={[styles.buttonSecondary, { borderColor: colors.border }]}
              onPress={() => router.replace("/")}
            >
              <Text style={[styles.buttonSecondaryText, { color: colors.text }]}>Return Home</Text>
            </Pressable>
          </View>
        </View>
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
  actions: { width: "100%", gap: 10, marginTop: 16 },
  button: { height: 48, borderRadius: 12, justifyContent: "center", alignItems: "center" },
  buttonText: { color: "#ffffff", fontWeight: "700", fontSize: 15 },
  buttonSecondary: { height: 48, borderRadius: 12, borderWidth: 1, justifyContent: "center", alignItems: "center" },
  buttonSecondaryText: { fontWeight: "600", fontSize: 15 },
});
