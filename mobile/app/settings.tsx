import { useMutation, useQuery } from "@tanstack/react-query";
import { type ReactNode, useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";

import { PageHeader } from "../components/PageHeader";
import { Screen } from "../components/Screen";
import { api } from "../api/client";
import { useLogout } from "../hooks/useLogout";
import { useScreenHeader } from "../hooks/useScreenHeader";
import { useTheme } from "../hooks/useTheme";
import { hapticImpact } from "../lib/haptics";
import { type User, useAuthStore } from "../store/authStore";

type SettingsPrefs = {
  learning_pace: string;
  daily_goal_minutes: number;
  notify_workbook: boolean;
  notify_quiz_results: boolean;
  notify_streak_reminder: boolean;
  notify_challenges: boolean;
  auto_advance_cards: boolean;
  show_difficulty_badges: boolean;
  quiz_time_limit: boolean;
  spaced_repetition_enabled: boolean;
  card_font_size: string;
  accessibility_high_contrast: boolean;
  language: string;
};

const DEFAULTS: SettingsPrefs = {
  learning_pace: "medium",
  daily_goal_minutes: 20,
  notify_workbook: true,
  notify_quiz_results: true,
  notify_streak_reminder: true,
  notify_challenges: true,
  auto_advance_cards: false,
  show_difficulty_badges: true,
  quiz_time_limit: true,
  spaced_repetition_enabled: true,
  card_font_size: "medium",
  accessibility_high_contrast: false,
  language: "en",
};

function readPrefs(user: User | null): SettingsPrefs {
  const raw = user?.preferences as { settings?: Partial<SettingsPrefs> } | undefined;
  return { ...DEFAULTS, ...(raw?.settings ?? {}) };
}

export default function SettingsScreen() {
  const { colors, scheme, isDark, toggleScheme } = useTheme();
  const header = useScreenHeader("Settings");
  const { user, accessToken, setAuth } = useAuthStore();
  const { confirmLogout } = useLogout();

  const [prefs, setPrefs] = useState<SettingsPrefs>(() => readPrefs(user));
  const [dirty, setDirty] = useState(false);

  const me = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const { data } = await api.get<User>("/users/me");
      return data;
    },
  });

  useEffect(() => {
    if (me.data) {
      setPrefs(readPrefs(me.data));
      setDirty(false);
    }
  }, [me.data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.patch<User>("/users/me", {
        preferences: { settings: prefs },
      });
      return data;
    },
    onSuccess: (data) => {
      if (accessToken) setAuth(data, accessToken);
      setDirty(false);
      Alert.alert("Saved", "Your settings were updated.");
    },
    onError: () => Alert.alert("Error", "Could not save settings."),
  });

  const set = <K extends keyof SettingsPrefs>(key: K, value: SettingsPrefs[K]) => {
    setPrefs((p) => ({ ...p, [key]: value }));
    setDirty(true);
  };

  return (
    <Screen>
      {header}
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <PageHeader title="Settings" subtitle="Customize your FlashLearn experience" />

        <Section title="Appearance" colors={colors}>
          <ToggleRow
            label="Dark mode"
            description={`Currently ${scheme === "dark" ? "on" : "off"}`}
            value={isDark}
            onValueChange={() => {
              void hapticImpact("light");
              toggleScheme();
            }}
            colors={colors}
          />
        </Section>

        <Section title="Learning" colors={colors}>
          <ToggleRow
            label="Spaced repetition"
            description="Smart card scheduling based on recall"
            value={prefs.spaced_repetition_enabled}
            onValueChange={(v) => set("spaced_repetition_enabled", v)}
            colors={colors}
          />
          <ToggleRow
            label="Quiz time limits"
            description="Countdown timers during quiz games"
            value={prefs.quiz_time_limit}
            onValueChange={(v) => set("quiz_time_limit", v)}
            colors={colors}
          />
          <ToggleRow
            label="Show difficulty badges"
            value={prefs.show_difficulty_badges}
            onValueChange={(v) => set("show_difficulty_badges", v)}
            colors={colors}
          />
          <Text style={[styles.goalLabel, { color: colors.text }]}>
            Daily study goal: {prefs.daily_goal_minutes} min
          </Text>
          <View style={styles.goalRow}>
            {[10, 20, 30, 45, 60].map((mins) => (
              <Pressable
                key={mins}
                style={[
                  styles.goalChip,
                  {
                    borderColor: colors.border,
                    backgroundColor: prefs.daily_goal_minutes === mins ? colors.primary : colors.surface,
                  },
                ]}
                onPress={() => set("daily_goal_minutes", mins)}
              >
                <Text
                  style={{
                    color: prefs.daily_goal_minutes === mins ? "#fff" : colors.text,
                    fontWeight: "600",
                    fontSize: 13,
                  }}
                >
                  {mins}m
                </Text>
              </Pressable>
            ))}
          </View>
        </Section>

        <Section title="Notifications" colors={colors}>
          <ToggleRow
            label="Workbook ready"
            value={prefs.notify_workbook}
            onValueChange={(v) => set("notify_workbook", v)}
            colors={colors}
          />
          <ToggleRow
            label="Quiz results"
            value={prefs.notify_quiz_results}
            onValueChange={(v) => set("notify_quiz_results", v)}
            colors={colors}
          />
          <ToggleRow
            label="Streak reminders"
            value={prefs.notify_streak_reminder}
            onValueChange={(v) => set("notify_streak_reminder", v)}
            colors={colors}
          />
          <ToggleRow
            label="Quiz challenges"
            value={prefs.notify_challenges}
            onValueChange={(v) => set("notify_challenges", v)}
            colors={colors}
          />
        </Section>

        <View style={styles.actions}>
          <Pressable
            style={[styles.logoutBtn, { borderColor: colors.danger }]}
            onPress={() => {
              void hapticImpact("light");
              confirmLogout();
            }}
          >
            <Text style={{ color: colors.danger, fontWeight: "700" }}>Log out</Text>
          </Pressable>
          <Pressable
            style={[styles.secondaryBtn, { borderColor: colors.border }]}
            onPress={() => {
              setPrefs(DEFAULTS);
              setDirty(true);
            }}
          >
            <Text style={{ color: colors.text, fontWeight: "600" }}>Reset defaults</Text>
          </Pressable>
          <Pressable
            style={[
              styles.primaryBtn,
              { backgroundColor: colors.primary },
              (!dirty || saveMutation.isPending) && { opacity: 0.5 },
            ]}
            disabled={!dirty || saveMutation.isPending}
            onPress={() => saveMutation.mutate()}
          >
            <Text style={styles.primaryBtnText}>
              {saveMutation.isPending ? "Saving…" : "Save changes"}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </Screen>
  );
}

function Section({
  title,
  children,
  colors,
}: {
  title: string;
  children: ReactNode;
  colors: { surface: string; border: string; text: string };
}) {
  return (
    <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
      {children}
    </View>
  );
}

function ToggleRow({
  label,
  description,
  value,
  onValueChange,
  colors,
}: {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  colors: { text: string; muted: string; primary: string };
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleCopy}>
        <Text style={[styles.toggleLabel, { color: colors.text }]}>{label}</Text>
        {description ? <Text style={[styles.toggleDesc, { color: colors.muted }]}>{description}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onValueChange} trackColor={{ true: colors.primary }} />
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 40 },
  section: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  sectionTitle: { fontSize: 16, fontWeight: "700", marginBottom: 10 },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 12,
  },
  toggleCopy: { flex: 1 },
  toggleLabel: { fontSize: 14, fontWeight: "600" },
  toggleDesc: { fontSize: 12, marginTop: 2 },
  goalLabel: { fontSize: 14, fontWeight: "600", marginBottom: 8 },
  goalRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  goalChip: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 40,
    justifyContent: "center",
  },
  actions: { paddingHorizontal: 16, gap: 10, marginTop: 4 },
  logoutBtn: {
    borderWidth: 1,
    borderRadius: 12,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBtn: {
    borderWidth: 1,
    borderRadius: 12,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtn: {
    borderRadius: 12,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
