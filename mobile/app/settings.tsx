import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import { PageHeader } from "../components/PageHeader";
import { Screen } from "../components/Screen";
import { api } from "../api/client";
import { useLogout } from "../hooks/useLogout";
import { useScreenHeader } from "../hooks/useScreenHeader";
import { useTheme } from "../hooks/useTheme";
import { hapticImpact } from "../lib/haptics";
import { getApiErrorMessage } from "../lib/apiErrors";
import { type User, useAuthStore } from "../store/authStore";
import {
  parseEngagementPreferencesResponse,
  parseUserResponse,
} from "../lib/preferences";
import { type EngagementPreferencesOut } from "../types/api";

type UserStudySettings = {
  learning_pace: string;
  daily_goal_minutes: number;
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

const DEFAULT_STUDY_SETTINGS: UserStudySettings = {
  learning_pace: "medium",
  daily_goal_minutes: 20,
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

const DEFAULT_ENGAGEMENT_PREFS: EngagementPreferencesOut = {
  in_app_enabled: true,
  learning_reminders: true,
  streak_reminders: true,
  weekly_summaries: true,
  achievement_announcements: true,
  marketing_emails: false,
  celebration_animations: true,
  achievement_sounds: false,
  streak_sounds: false,
  quiet_hours_start: null,
  quiet_hours_end: null,
  timezone: "UTC",
};

function readStudySettings(user: User | null): UserStudySettings {
  const raw = user?.preferences as { settings?: Partial<UserStudySettings> } | undefined;
  return { ...DEFAULT_STUDY_SETTINGS, ...(raw?.settings ?? {}) };
}

export default function SettingsScreen() {
  const { colors, scheme, isDark, toggleScheme } = useTheme();
  const header = useScreenHeader("Settings");
  const queryClient = useQueryClient();
  const { user, accessToken, setAuth, bootstrapStatus } = useAuthStore();
  const { confirmLogout } = useLogout();

  const isMountedRef = useRef(true);
  const saveAttemptIdRef = useRef(0);
  const saveInFlightRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // 1. Independent query for User / Study Settings
  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const { data } = await api.get<User>("/users/me");
      return data;
    },
  });

  // 2. Independent query for Engagement Preferences
  const engagementQuery = useQuery({
    queryKey: ["engagement-preferences"],
    queryFn: async () => {
      const { data } = await api.get<EngagementPreferencesOut>("/engagement/preferences");
      return data;
    },
  });

  // Server state tracking
  const serverUser = meQuery.data ?? user;
  const serverEngagement = engagementQuery.data;

  // Local Draft States
  const [studyDraft, setStudyDraft] = useState<UserStudySettings>(() => readStudySettings(serverUser));
  const [engagementDraft, setEngagementDraft] = useState<EngagementPreferencesOut>(() => serverEngagement ?? DEFAULT_ENGAGEMENT_PREFS);

  const [studyDirty, setStudyDirty] = useState(false);
  const [engagementDirty, setEngagementDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // Sync draft from server when server data updates (only if draft not dirty)
  useEffect(() => {
    if (serverUser && !studyDirty) {
      setStudyDraft(readStudySettings(serverUser));
    }
  }, [serverUser, studyDirty]);

  useEffect(() => {
    if (serverEngagement && !engagementDirty) {
      setEngagementDraft(serverEngagement);
    }
  }, [serverEngagement, engagementDirty]);

  const setStudyKey = <K extends keyof UserStudySettings>(key: K, value: UserStudySettings[K]) => {
    setStudyDraft((prev) => ({ ...prev, [key]: value }));
    setStudyDirty(true);
  };

  const setEngagementKey = <K extends keyof EngagementPreferencesOut>(key: K, value: EngagementPreferencesOut[K]) => {
    setEngagementDraft((prev) => ({ ...prev, [key]: value }));
    setEngagementDirty(true);
  };

  const handleSave = async () => {
    if (saveInFlightRef.current || (!studyDirty && !engagementDirty)) return;

    const currentUserId = user?.id;
    if (!currentUserId || bootstrapStatus !== "authenticated") {
      Alert.alert("Sign in again", "Your sign-in has expired. Please continue to sign in again.");
      return;
    }

    saveAttemptIdRef.current += 1;
    const currentAttemptId = saveAttemptIdRef.current;
    saveInFlightRef.current = true;
    setSaving(true);

    let studySuccess = false;
    let engagementSuccess = false;
    let studyErrorMsg: string | null = null;
    let engagementErrorMsg: string | null = null;

    try {
      // 1. Save Study Settings if dirty
      if (studyDirty) {
        try {
          const { data: updatedUser } = await api.patch<User>("/users/me", {
            preferences: { settings: studyDraft },
          });

          // Post-request identity & mounted validation and runtime parsing
          const latestUser = useAuthStore.getState().user;
          const latestAuth = useAuthStore.getState().bootstrapStatus;
          const parseResult = parseUserResponse(updatedUser, currentUserId);

          if (
            isMountedRef.current &&
            currentAttemptId === saveAttemptIdRef.current &&
            latestUser?.id === currentUserId &&
            latestAuth === "authenticated" &&
            parseResult.valid
          ) {
            if (accessToken) setAuth(parseResult.user, accessToken);
            queryClient.setQueryData<User>(["me"], parseResult.user);
            studySuccess = true;
          } else if (!parseResult.valid) {
            studyErrorMsg = "MindFlip couldn't load your updated study settings. Please try again.";
          }
        } catch (e) {
          studyErrorMsg = getApiErrorMessage(e, "Could not save study settings.");
        }
      }

      // 2. Save Engagement Preferences if dirty
      if (engagementDirty) {
        try {
          const { data: updatedEng } = await api.patch<EngagementPreferencesOut>(
            "/engagement/preferences",
            engagementDraft,
          );

          const latestUser = useAuthStore.getState().user;
          const latestAuth = useAuthStore.getState().bootstrapStatus;
          const parseResult = parseEngagementPreferencesResponse(updatedEng);

          if (
            isMountedRef.current &&
            currentAttemptId === saveAttemptIdRef.current &&
            latestUser?.id === currentUserId &&
            latestAuth === "authenticated" &&
            parseResult.valid
          ) {
            queryClient.setQueryData<EngagementPreferencesOut>(
              ["engagement-preferences"],
              parseResult.preferences,
            );
            engagementSuccess = true;
          } else if (!parseResult.valid) {
            engagementErrorMsg = "MindFlip couldn't load your updated engagement preferences. Please try again.";
          }
        } catch (e) {
          engagementErrorMsg = getApiErrorMessage(e, "Could not save engagement preferences.");
        }
      }

      if (!isMountedRef.current || currentAttemptId !== saveAttemptIdRef.current) {
        return;
      }

      // Truthful Feedback & Dirty State Reset
      if (studyDirty && engagementDirty) {
        if (studySuccess && engagementSuccess) {
          setStudyDirty(false);
          setEngagementDirty(false);
          Alert.alert("Success", "All settings updated successfully.");
        } else if (studySuccess && !engagementSuccess) {
          setStudyDirty(false);
          Alert.alert(
            "Partial Success",
            `Study preferences were saved, but engagement settings failed: ${engagementErrorMsg}`,
          );
        } else if (!studySuccess && engagementSuccess) {
          setEngagementDirty(false);
          Alert.alert(
            "Partial Success",
            `Engagement preferences were saved, but study settings failed: ${studyErrorMsg}`,
          );
        } else {
          Alert.alert("Save Failed", `Study error: ${studyErrorMsg}\nEngagement error: ${engagementErrorMsg}`);
        }
      } else if (studyDirty) {
        if (studySuccess) {
          setStudyDirty(false);
          Alert.alert("Success", "Study settings updated.");
        } else {
          Alert.alert("Error", studyErrorMsg ?? "Could not save study settings.");
        }
      } else if (engagementDirty) {
        if (engagementSuccess) {
          setEngagementDirty(false);
          Alert.alert("Success", "Engagement preferences updated.");
        } else {
          Alert.alert("Error", engagementErrorMsg ?? "Could not save engagement preferences.");
        }
      }
    } finally {
      if (currentAttemptId === saveAttemptIdRef.current) {
        saveInFlightRef.current = false;
        if (isMountedRef.current) {
          setSaving(false);
        }
      }
    }
  };

  const handleResetDefaults = () => {
    void hapticImpact("light");
    setStudyDraft(DEFAULT_STUDY_SETTINGS);
    setEngagementDraft(DEFAULT_ENGAGEMENT_PREFS);
    setStudyDirty(true);
    setEngagementDirty(true);
  };

  return (
    <Screen>
      {header}
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <PageHeader title="Settings" subtitle="Customize your MindFlip experience" />

        {/* Loading and Error Indicators */}
        {meQuery.isError || engagementQuery.isError ? (
          <View style={[styles.banner, { backgroundColor: colors.danger + "15", borderColor: colors.danger }]}>
            <Text style={{ color: colors.danger, fontWeight: "600" }}>
              {meQuery.isError && engagementQuery.isError
                ? "Couldn't load your settings."
                : meQuery.isError
                  ? "Could not load study settings."
                  : "Could not load engagement preferences."}
            </Text>
          </View>
        ) : null}

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

        <Section title="Learning Preferences" colors={colors}>
          <Text style={[styles.goalLabel, { color: colors.text }]}>Learning pace</Text>
          <View style={styles.goalRow}>
            {(
              [
                { id: "relaxed", label: "Relaxed" },
                { id: "medium", label: "Balanced" },
                { id: "intensive", label: "Intensive" },
              ] as const
            ).map((pace) => (
              <Pressable
                key={pace.id}
                style={[
                  styles.goalChip,
                  {
                    borderColor: colors.border,
                    backgroundColor: studyDraft.learning_pace === pace.id ? colors.primary : colors.surface,
                  },
                ]}
                onPress={() => setStudyKey("learning_pace", pace.id)}
              >
                <Text style={{ color: studyDraft.learning_pace === pace.id ? "#fff" : colors.text, fontWeight: "600" }}>
                  {pace.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={[styles.paceHint, { color: colors.muted }]}>
            {studyDraft.learning_pace === "relaxed" && "Fewer reviews and a lighter workload."}
            {studyDraft.learning_pace === "medium" && "Moderate review schedule for steady progress."}
            {studyDraft.learning_pace === "intensive" && "More frequent reviews and higher daily goals."}
          </Text>

          <ToggleRow
            label="Auto-advance cards"
            description="Move to next card after rating"
            value={studyDraft.auto_advance_cards}
            onValueChange={(v) => setStudyKey("auto_advance_cards", v)}
            colors={colors}
          />
          <ToggleRow
            label="Spaced repetition"
            description="Smart card scheduling based on recall"
            value={studyDraft.spaced_repetition_enabled}
            onValueChange={(v) => setStudyKey("spaced_repetition_enabled", v)}
            colors={colors}
          />
          <ToggleRow
            label="Quiz time limits"
            description="Countdown timers during quiz games"
            value={studyDraft.quiz_time_limit}
            onValueChange={(v) => setStudyKey("quiz_time_limit", v)}
            colors={colors}
          />
          <ToggleRow
            label="Show difficulty badges"
            value={studyDraft.show_difficulty_badges}
            onValueChange={(v) => setStudyKey("show_difficulty_badges", v)}
            colors={colors}
          />

          <Text style={[styles.goalLabel, { color: colors.text, marginTop: 8 }]}>
            Daily study goal: {studyDraft.daily_goal_minutes} min
          </Text>
          <View style={styles.goalRow}>
            {[10, 20, 30, 45, 60].map((mins) => (
              <Pressable
                key={mins}
                style={[
                  styles.goalChip,
                  {
                    borderColor: colors.border,
                    backgroundColor: studyDraft.daily_goal_minutes === mins ? colors.primary : colors.surface,
                  },
                ]}
                onPress={() => setStudyKey("daily_goal_minutes", mins)}
              >
                <Text
                  style={{
                    color: studyDraft.daily_goal_minutes === mins ? "#fff" : colors.text,
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

        {/* Engagement Preferences Section */}
        <Section title="Engagement & Reminders" colors={colors}>
          <ToggleRow
            label="In-app notifications"
            description="Enable in-app nudges and alerts"
            value={engagementDraft.in_app_enabled}
            onValueChange={(v) => setEngagementKey("in_app_enabled", v)}
            colors={colors}
          />
          <ToggleRow
            label="Learning reminders"
            description="Prompts when there is a useful next action"
            value={engagementDraft.learning_reminders}
            onValueChange={(v) => setEngagementKey("learning_reminders", v)}
            colors={colors}
          />
          <ToggleRow
            label="Streak reminders"
            description="Daily nudge to keep your streak alive"
            value={engagementDraft.streak_reminders}
            onValueChange={(v) => setEngagementKey("streak_reminders", v)}
            colors={colors}
          />
          <ToggleRow
            label="Weekly summaries"
            description="Concise review of weekly study progress"
            value={engagementDraft.weekly_summaries}
            onValueChange={(v) => setEngagementKey("weekly_summaries", v)}
            colors={colors}
          />
          <ToggleRow
            label="Achievement announcements"
            description="Milestone and achievement alerts"
            value={engagementDraft.achievement_announcements}
            onValueChange={(v) => setEngagementKey("achievement_announcements", v)}
            colors={colors}
          />
          <ToggleRow
            label="Marketing emails"
            description="Optional news and features"
            value={engagementDraft.marketing_emails}
            onValueChange={(v) => setEngagementKey("marketing_emails", v)}
            colors={colors}
          />
          <ToggleRow
            label="Celebration animations"
            description="Show celebratory milestone effects"
            value={engagementDraft.celebration_animations}
            onValueChange={(v) => setEngagementKey("celebration_animations", v)}
            colors={colors}
          />
          <ToggleRow
            label="Achievement sounds"
            description="Play audio on achievement unlock"
            value={engagementDraft.achievement_sounds}
            onValueChange={(v) => setEngagementKey("achievement_sounds", v)}
            colors={colors}
          />
          <ToggleRow
            label="Streak sounds"
            description="Play audio for streak milestones"
            value={engagementDraft.streak_sounds}
            onValueChange={(v) => setEngagementKey("streak_sounds", v)}
            colors={colors}
          />
          <View style={styles.inputField}>
            <Text style={[styles.fieldLabel, { color: colors.text }]}>Timezone</Text>
            <TextInput
              style={[styles.textInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              value={engagementDraft.timezone}
              onChangeText={(v) => setEngagementKey("timezone", v)}
              placeholder="e.g. UTC, Africa/Freetown"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        </Section>

        {/* Actions */}
        <View style={styles.actions}>
          <Pressable
            style={[
              styles.primaryBtn,
              { backgroundColor: colors.primary },
              (!studyDirty && !engagementDirty || saving) && { opacity: 0.5 },
            ]}
            disabled={(!studyDirty && !engagementDirty) || saving}
            onPress={handleSave}
          >
            <Text style={styles.primaryBtnText}>{saving ? "Saving…" : "Save changes"}</Text>
          </Pressable>

          <Pressable
            style={[styles.secondaryBtn, { borderColor: colors.border }]}
            onPress={handleResetDefaults}
          >
            <Text style={{ color: colors.text, fontWeight: "600" }}>Reset defaults</Text>
          </Pressable>

          <Pressable
            style={[styles.logoutBtn, { borderColor: colors.danger }]}
            onPress={() => {
              void hapticImpact("light");
              confirmLogout();
            }}
          >
            <Text style={{ color: colors.danger, fontWeight: "700" }}>Log out</Text>
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
  children: React.ReactNode;
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
  banner: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
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
  paceHint: { fontSize: 13, marginBottom: 12, lineHeight: 18 },
  goalRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  goalChip: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 40,
    justifyContent: "center",
  },
  inputField: { marginTop: 4, marginBottom: 8 },
  fieldLabel: { fontSize: 14, fontWeight: "600", marginBottom: 6 },
  textInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
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
