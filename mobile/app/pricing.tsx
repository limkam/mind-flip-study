import { Stack, useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Screen } from "../components/Screen";
import { UpgradeSection } from "../components/UpgradeSection";
import { useTheme } from "../hooks/useTheme";
import { subscriptionsEnabled } from "../lib/billing";
import { useAuthStore } from "../store/authStore";

export default function PricingScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const user = useAuthStore((state) => state.user);

  const isEnabled = subscriptionsEnabled();

  return (
    <Screen edges={["bottom"]}>
      <Stack.Screen options={{ title: "Plans & pricing" }} />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {!isEnabled ? (
          <View
            style={[
              styles.hero,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.title, { color: colors.text }]}>
              Subscriptions unavailable
            </Text>
            <Text style={[styles.subtitle, { color: colors.muted }]}>
              Subscription upgrades are not currently available.
            </Text>
            <View style={styles.actionRow}>
              <Pressable
                style={[styles.button, { backgroundColor: colors.primary }]}
                onPress={() => router.replace("/billing")}
                accessibilityRole="button"
                accessibilityLabel="Open Billing & Credits"
              >
                <Text style={[styles.buttonText, { color: colors.onPrimary }]}>Open Billing & Credits</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.button,
                  styles.buttonOutline,
                  { borderColor: colors.border },
                ]}
                onPress={() => router.replace("/(tabs)/more")}
                accessibilityRole="button"
                accessibilityLabel="More"
              >
                <Text style={[styles.buttonOutlineText, { color: colors.text }]}>
                  More
                </Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <>
            <View
              style={[
                styles.hero,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.title, { color: colors.text }]}>
                Choose the right plan
              </Text>
              <Text style={[styles.subtitle, { color: colors.muted }]}>
                Compare the available plans and continue studying.
              </Text>
            </View>
            <UpgradeSection
              subscriptionTier={user?.subscription_tier}
              showAllPlans
            />
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 40, gap: 24 },
  hero: { borderWidth: 1, borderRadius: 20, padding: 20, gap: 12 },
  title: { fontSize: 26, fontWeight: "800" },
  subtitle: { fontSize: 15, lineHeight: 22 },
  actionRow: { flexDirection: "row", gap: 10, marginTop: 8 },
  button: {
    borderRadius: 10,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  buttonText: { fontWeight: "700", fontSize: 14 },
  buttonOutline: { borderWidth: 1, backgroundColor: "transparent" },
  buttonOutlineText: { fontWeight: "600", fontSize: 14 },
});
