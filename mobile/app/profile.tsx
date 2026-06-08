import * as Sentry from "@sentry/react-native";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";

import { UpgradeSection } from "../components/UpgradeSection";
import { PageHeader } from "../components/PageHeader";
import { Screen } from "../components/Screen";
import { api } from "../api/client";
import { useLogout } from "../hooks/useLogout";
import { useScreenHeader } from "../hooks/useScreenHeader";
import { useTheme } from "../hooks/useTheme";
import { subscriptionLabel, subscriptionsEnabled } from "../lib/billing";
import { hapticImpact } from "../lib/haptics";
import { type User, useAuthStore } from "../store/authStore";

const STUDY_THEMES = [
  { id: "indigo", label: "Indigo Classic" },
  { id: "ocean", label: "Ocean Blue" },
  { id: "sunset", label: "Sunset" },
  { id: "forest", label: "Forest" },
  { id: "midnight", label: "Midnight" },
  { id: "rose", label: "Rose" },
];

const DAILY_GOAL_OPTIONS = [10, 20, 30, 50, 100];

export default function ProfileScreen() {
  const { colors, scheme, isDark, toggleScheme } = useTheme();
  const header = useScreenHeader("My Profile");
  const { confirmLogout } = useLogout();
  const { user, accessToken, setAuth } = useAuthStore();

  const me = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const { data } = await api.get<User>("/users/me");
      return data;
    },
  });

  const profile = me.data ?? user;
  const prefs = (profile?.preferences ?? {}) as {
    study_theme?: string;
    daily_goal?: number;
    notifications?: boolean;
  };

  const [selectedTheme, setSelectedTheme] = useState(prefs.study_theme ?? "indigo");
  const [dailyGoal, setDailyGoal] = useState(prefs.daily_goal ?? 20);
  const [notifications, setNotifications] = useState(prefs.notifications !== false);

  useEffect(() => {
    if (me.data) {
      const p = (me.data.preferences ?? {}) as typeof prefs;
      setSelectedTheme(p.study_theme ?? "indigo");
      setDailyGoal(p.daily_goal ?? 20);
      setNotifications(p.notifications !== false);
    }
  }, [me.data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.patch<User>("/users/me", {
        preferences: {
          study_theme: selectedTheme,
          daily_goal: dailyGoal,
          notifications,
        },
      });
      return data;
    },
    onSuccess: (data) => {
      if (accessToken) setAuth(data, accessToken);
      Alert.alert("Saved", "Your preferences were updated.");
    },
    onError: () => Alert.alert("Error", "Could not save preferences."),
  });

  return (
    <Screen>
      {header}
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <PageHeader title="My Profile" subtitle="Account and study preferences" />

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.section, { color: colors.text }]}>Account</Text>
          <Text style={[styles.value, { color: colors.text }]}>{profile?.full_name}</Text>
          <Text style={[styles.email, { color: colors.muted }]}>{profile?.email}</Text>
          <View style={styles.badges}>
            <Text style={[styles.badge, { color: colors.primary, backgroundColor: colors.primary + "18" }]}>
              {profile?.role}
            </Text>
            {subscriptionsEnabled() ? (
              <Text style={[styles.badge, { color: colors.muted, backgroundColor: colors.border + "55" }]}>
                {subscriptionLabel(profile?.subscription_tier)} plan
              </Text>
            ) : null}
          </View>
        </View>

        {(profile?.date_of_birth || profile?.country || profile?.occupation || profile?.job_title) ? (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.section, { color: colors.text }]}>Profile details</Text>
            {profile?.date_of_birth ? (
              <InfoRow label="Date of birth" value={profile.date_of_birth} colors={colors} />
            ) : null}
            {profile?.age != null ? (
              <InfoRow label="Age" value={String(profile.age)} colors={colors} />
            ) : null}
            {profile?.country ? <InfoRow label="Country" value={profile.country} colors={colors} /> : null}
            {profile?.custom_country ? (
              <InfoRow label="Custom country" value={profile.custom_country} colors={colors} />
            ) : null}
            {profile?.continent ? <InfoRow label="Continent" value={profile.continent} colors={colors} /> : null}
            {profile?.occupation ? <InfoRow label="Occupation" value={profile.occupation} colors={colors} /> : null}
            {profile?.job_title ? <InfoRow label="Job title" value={profile.job_title} colors={colors} /> : null}
          </View>
        ) : null}

        {subscriptionsEnabled() ? (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.section, { color: colors.text }]}>Subscription</Text>
            <UpgradeSection subscriptionTier={profile?.subscription_tier} />
          </View>
        ) : null}

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.section, { color: colors.text }]}>Appearance</Text>
          <Text style={[styles.hint, { color: colors.muted }]}>
            Current: {scheme === "dark" ? "Dark" : "Light"} mode
          </Text>
          <Pressable
            style={[styles.outlineBtn, { borderColor: colors.border }]}
            onPress={() => {
              void hapticImpact("light");
              toggleScheme();
            }}
          >
            <Text style={[styles.outlineBtnText, { color: colors.text }]}>
              Switch to {isDark ? "light" : "dark"} mode
            </Text>
          </Pressable>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.section, { color: colors.text }]}>Study theme</Text>
          <View style={styles.themeGrid}>
            {STUDY_THEMES.map((theme) => (
              <Pressable
                key={theme.id}
                style={[
                  styles.themeChip,
                  {
                    borderColor: selectedTheme === theme.id ? colors.primary : colors.border,
                    backgroundColor: selectedTheme === theme.id ? colors.primary + "14" : colors.background,
                  },
                ]}
                onPress={() => setSelectedTheme(theme.id)}
              >
                <Text style={{ color: colors.text, fontWeight: selectedTheme === theme.id ? "700" : "500" }}>
                  {theme.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.section, { color: colors.text }]}>Study preferences</Text>
          <Text style={[styles.hint, { color: colors.muted }]}>Daily card goal</Text>
          <View style={styles.goalRow}>
            {DAILY_GOAL_OPTIONS.map((n) => (
              <Pressable
                key={n}
                style={[
                  styles.goalChip,
                  {
                    borderColor: dailyGoal === n ? colors.primary : colors.border,
                    backgroundColor: dailyGoal === n ? colors.primary + "14" : colors.background,
                  },
                ]}
                onPress={() => setDailyGoal(n)}
              >
                <Text style={{ color: colors.text, fontWeight: dailyGoal === n ? "700" : "500" }}>{n}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.switchLabel, { color: colors.text }]}>Study reminders</Text>
              <Text style={[styles.hint, { color: colors.muted }]}>Keep your streak alive</Text>
            </View>
            <Switch value={notifications} onValueChange={setNotifications} />
          </View>
        </View>

        <Pressable
          style={[styles.saveBtn, { backgroundColor: colors.primary }]}
          onPress={() => {
            void hapticImpact("light");
            saveMutation.mutate();
          }}
          disabled={saveMutation.isPending}
        >
          <Text style={styles.saveBtnText}>{saveMutation.isPending ? "Saving…" : "Save preferences"}</Text>
        </Pressable>

        {typeof process.env.EXPO_PUBLIC_SENTRY_DSN === "string" &&
        process.env.EXPO_PUBLIC_SENTRY_DSN.length > 0 ? (
          <Pressable
            style={[styles.outline, { borderColor: colors.border, backgroundColor: colors.surface }]}
            onPress={() => {
              void hapticImpact("light");
              Sentry.captureException(new Error("MindFlip Sentry connectivity verify (React Native)"));
              Alert.alert("Sent", "Check your Sentry project for the test issue.");
            }}
          >
            <Text style={[styles.outlineText, { color: colors.text }]}>Send Sentry test event</Text>
          </Pressable>
        ) : null}

        <Pressable
          style={[styles.outline, { borderColor: colors.border, backgroundColor: colors.surface }]}
          onPress={() => {
            void hapticImpact("light");
            confirmLogout();
          }}
        >
          <Text style={[styles.outlineText, { color: colors.danger }]}>Log out</Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

function InfoRow({
  label,
  value,
  colors,
}: {
  label: string;
  value: string;
  colors: { text: string; muted: string };
}) {
  return (
    <View style={styles.infoRow}>
      <Text style={[styles.infoLabel, { color: colors.muted }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 32 },
  card: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    gap: 8,
  },
  section: { fontSize: 16, fontWeight: "700", marginBottom: 4 },
  value: { fontSize: 18, fontWeight: "600" },
  email: { fontSize: 15 },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  badge: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "capitalize",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  hint: { fontSize: 14 },
  outlineBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    minHeight: 44,
    justifyContent: "center",
  },
  outlineBtnText: { fontWeight: "600", fontSize: 15 },
  themeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  themeChip: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 40,
    justifyContent: "center",
  },
  goalRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  goalChip: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minWidth: 48,
    alignItems: "center",
  },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 4 },
  switchLabel: { fontSize: 15, fontWeight: "600" },
  saveBtn: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    minHeight: 44,
    justifyContent: "center",
  },
  saveBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  infoRow: { gap: 2 },
  infoLabel: { fontSize: 12, textTransform: "uppercase" },
  infoValue: { fontSize: 15, fontWeight: "500" },
  outline: {
    marginHorizontal: 16,
    marginTop: 4,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    minHeight: 44,
    justifyContent: "center",
  },
  outlineText: { fontWeight: "600" },
});
