import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { useTheme } from "../hooks/useTheme";
import { subscribeUpgradeLimit } from "../lib/upgradeLimitEvents";

function friendlyMessage(reason?: string) {
  const text = String(reason || "").toLowerCase();
  if (text.includes("flashcard-set") || text.includes("flashcard set")) {
    return "You've used all the flashcard sets included in your current plan. Upgrade your plan to continue creating more flashcard sets and unlock additional features.";
  }
  if (text.includes("book")) return "You've used all the book imports included in your current plan. Upgrade to add more books and keep building your study library.";
  if (text.includes("challenge")) return "Quiz challenges are unavailable on your current plan. Upgrade to unlock this feature.";
  if (text.includes("regenerat") || text.includes("credit")) return "Your current plan doesn't have enough credits for this action. Upgrade to continue and receive additional monthly allowances.";
  return "You've reached a limit included in your current plan. Upgrade to continue and unlock additional features.";
}

export function UpgradeLimitModal() {
  const { colors } = useTheme();
  const router = useRouter();
  const [message, setMessage] = useState("");

  useEffect(() => subscribeUpgradeLimit(({ reason }) => setMessage(friendlyMessage(reason))), []);

  const close = () => setMessage("");

  return (
    <Modal visible={Boolean(message)} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.icon, { backgroundColor: colors.primary }]}><Text style={styles.iconText}>✦</Text></View>
          <Text style={[styles.title, { color: colors.text }]}>You've reached your plan limit</Text>
          <Text style={[styles.message, { color: colors.muted }]}>{message}</Text>
          <View style={styles.actions}>
            <Pressable style={[styles.secondary, { borderColor: colors.border }]} onPress={close}>
              <Text style={[styles.secondaryText, { color: colors.text }]}>Maybe Later</Text>
            </Pressable>
            <Pressable
              style={[styles.primary, { backgroundColor: colors.primary }]}
              onPress={() => {
                close();
                router.push("/pricing");
              }}
            >
              <Text style={styles.primaryText}>Upgrade Plan</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: "rgba(0,0,0,0.62)" },
  card: { borderWidth: 1, borderRadius: 24, padding: 24, gap: 14 },
  icon: { width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  iconText: { color: "#fff", fontSize: 26, fontWeight: "800" },
  title: { fontSize: 23, lineHeight: 29, fontWeight: "800" },
  message: { fontSize: 15, lineHeight: 23 },
  actions: { marginTop: 8, gap: 10 },
  primary: { minHeight: 48, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  primaryText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  secondary: { minHeight: 48, borderWidth: 1, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  secondaryText: { fontSize: 15, fontWeight: "700" },
});
