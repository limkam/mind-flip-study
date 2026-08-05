import * as Sentry from "@sentry/react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "expo-router";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
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
import {
  STUDY_THEMES,
  getStudyTheme,
  parseUserResponse,
  validateAvatarUrl,
  validateDisplayName,
} from "../lib/preferences";
import { type User, useAuthStore } from "../store/authStore";
import { type AnalyticsSummaryOut } from "../types/api";

function formatStudyTime(seconds = 0) {
  if (seconds < 60) return `${seconds}s`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export default function ProfileScreen() {
  const { colors, scheme, isDark, toggleScheme } = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const header = useScreenHeader("My Profile");
  const { confirmLogout } = useLogout();
  const { user, accessToken, setAuth, bootstrapStatus } = useAuthStore();

  const isMountedRef = useRef(true);
  const saveAttemptIdRef = useRef(0);
  const saveInFlightRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const { data } = await api.get<User>("/users/me");
      return data;
    },
  });

  const analyticsQuery = useQuery({
    queryKey: ["analytics-summary"],
    queryFn: async () => {
      const { data } = await api.get<AnalyticsSummaryOut>("/analytics/summary");
      return data;
    },
  });

  const profile = meQuery.data ?? user;
  const prefs = (profile?.preferences ?? {}) as { study_theme?: string };

  // Profile Form States
  const [fullName, setFullName] = useState(profile?.full_name ?? "");
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url ?? "");
  const [occupation, setOccupation] = useState(profile?.occupation ?? "");
  const [jobTitle, setJobTitle] = useState(profile?.job_title ?? "");
  const [dateOfBirth, setDateOfBirth] = useState(profile?.date_of_birth ?? "");
  const [selectedTheme, setSelectedTheme] = useState(prefs.study_theme ?? "indigo");

  const [savingProfile, setSavingProfile] = useState(false);
  const [savingTheme, setSavingTheme] = useState(false);

  // Synchronize state when server profile updates if not actively editing
  useEffect(() => {
    if (meQuery.data) {
      setFullName(meQuery.data.full_name ?? "");
      setAvatarUrl(meQuery.data.avatar_url ?? "");
      setOccupation(meQuery.data.occupation ?? "");
      setJobTitle(meQuery.data.job_title ?? "");
      setDateOfBirth(meQuery.data.date_of_birth ?? "");
      const p = (meQuery.data.preferences ?? {}) as { study_theme?: string };
      setSelectedTheme(p.study_theme ?? "indigo");
    }
  }, [meQuery.data]);

  const handleSaveProfile = async () => {
    if (saveInFlightRef.current) return;

    const currentUserId = user?.id;
    if (!currentUserId || bootstrapStatus !== "authenticated") {
      Alert.alert("Authentication Error", "Your session has expired. Please sign in again.");
      return;
    }

    // Validation checks
    const nameCheck = validateDisplayName(fullName);
    if (!nameCheck.valid) {
      Alert.alert("Validation Error", nameCheck.reason);
      return;
    }

    if (profile?.auth_provider !== "google") {
      const avatarCheck = validateAvatarUrl(avatarUrl);
      if (!avatarCheck.valid) {
        Alert.alert("Validation Error", avatarCheck.reason);
        return;
      }
    }

    saveAttemptIdRef.current += 1;
    const currentAttemptId = saveAttemptIdRef.current;
    saveInFlightRef.current = true;
    setSavingProfile(true);

    try {
      const body: Record<string, unknown> = {
        full_name: nameCheck.name,
        occupation: occupation.trim() || null,
        job_title: jobTitle.trim() || null,
        date_of_birth: dateOfBirth.trim() || null,
      };

      if (profile?.auth_provider !== "google") {
        body.avatar_url = avatarUrl.trim() || null;
      }

      const { data: updatedUser } = await api.patch<User>("/users/me", body);

      // Post-request identity & mounted validation and runtime parsing
      const latestUser = useAuthStore.getState().user;
      const latestAuth = useAuthStore.getState().bootstrapStatus;
      const parseResult = parseUserResponse(updatedUser, currentUserId);

      if (
        !isMountedRef.current ||
        currentAttemptId !== saveAttemptIdRef.current ||
        latestUser?.id !== currentUserId ||
        latestAuth !== "authenticated"
      ) {
        return;
      }

      if (!parseResult.valid) {
        Alert.alert("Contract Error", `Invalid response from server: ${parseResult.reason}`);
        return;
      }

      if (accessToken) setAuth(parseResult.user, accessToken);
      queryClient.setQueryData<User>(["me"], parseResult.user);
      Alert.alert("Success", "Profile updated successfully.");
    } catch (e) {
      if (isMountedRef.current && currentAttemptId === saveAttemptIdRef.current) {
        Alert.alert("Could Not Save Profile", getApiErrorMessage(e, "Please try again."));
      }
    } finally {
      if (currentAttemptId === saveAttemptIdRef.current) {
        saveInFlightRef.current = false;
        if (isMountedRef.current) {
          setSavingProfile(false);
        }
      }
    }
  };

  const handleSelectTheme = async (themeId: string) => {
    if (saveInFlightRef.current) return;

    const currentUserId = user?.id;
    if (!currentUserId || bootstrapStatus !== "authenticated") {
      return;
    }

    const previousTheme = selectedTheme;
    setSelectedTheme(themeId);

    saveAttemptIdRef.current += 1;
    const currentAttemptId = saveAttemptIdRef.current;
    saveInFlightRef.current = true;
    setSavingTheme(true);

    try {
      const mergedPreferences = {
        ...(profile?.preferences ?? {}),
        study_theme: themeId,
      };

      const { data: updatedUser } = await api.patch<User>("/users/me", {
        preferences: mergedPreferences,
      });

      const latestUser = useAuthStore.getState().user;
      const latestAuth = useAuthStore.getState().bootstrapStatus;
      const parseResult = parseUserResponse(updatedUser, currentUserId);

      if (
        !isMountedRef.current ||
        currentAttemptId !== saveAttemptIdRef.current ||
        latestUser?.id !== currentUserId ||
        latestAuth !== "authenticated"
      ) {
        return;
      }

      if (!parseResult.valid) {
        setSelectedTheme(previousTheme);
        return;
      }

      if (accessToken) setAuth(parseResult.user, accessToken);
      queryClient.setQueryData<User>(["me"], parseResult.user);
    } catch {
      if (isMountedRef.current && currentAttemptId === saveAttemptIdRef.current) {
        setSelectedTheme(previousTheme);
        Alert.alert("Error", "Could not update study theme.");
      }
    } finally {
      if (currentAttemptId === saveAttemptIdRef.current) {
        saveInFlightRef.current = false;
        if (isMountedRef.current) {
          setSavingTheme(false);
        }
      }
    }
  };

  const stats = analyticsQuery.data;
  const activeThemeDef = getStudyTheme(selectedTheme);

  return (
    <Screen>
      {header}
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <PageHeader title="My Profile" subtitle="Your identity and study progress" />

        {/* Account Summary & Editable Fields */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Account Details</Text>

          <View style={styles.inputField}>
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>Display name</Text>
            <TextInput
              style={[styles.textInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              value={fullName}
              onChangeText={setFullName}
              maxLength={255}
              placeholder="Your full name"
              placeholderTextColor={colors.muted}
            />
          </View>

          <View style={styles.inputField}>
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>Email address</Text>
            <TextInput
              style={[styles.textInput, { color: colors.muted, borderColor: colors.border, backgroundColor: colors.surface }]}
              value={profile?.email ?? ""}
              editable={false}
            />
          </View>

          {profile?.auth_provider !== "google" ? (
            <View style={styles.inputField}>
              <Text style={[styles.fieldLabel, { color: colors.muted }]}>Profile picture URL</Text>
              <TextInput
                style={[styles.textInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                value={avatarUrl}
                onChangeText={setAvatarUrl}
                placeholder="https://example.com/avatar.jpg"
                placeholderTextColor={colors.muted}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          ) : (
            <Text style={[styles.hint, { color: colors.muted }]}>Profile picture managed by Google</Text>
          )}

          <View style={styles.inputField}>
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>Occupation</Text>
            <TextInput
              style={[styles.textInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              value={occupation}
              onChangeText={setOccupation}
              maxLength={100}
              placeholder="e.g. Student, Engineer"
              placeholderTextColor={colors.muted}
            />
          </View>

          <View style={styles.inputField}>
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>Job Title</Text>
            <TextInput
              style={[styles.textInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              value={jobTitle}
              onChangeText={setJobTitle}
              maxLength={100}
              placeholder="e.g. Software Developer"
              placeholderTextColor={colors.muted}
            />
          </View>

          <View style={styles.inputField}>
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>Date of birth (YYYY-MM-DD)</Text>
            <TextInput
              style={[styles.textInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              value={dateOfBirth}
              onChangeText={setDateOfBirth}
              placeholder="1998-05-15"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
            />
          </View>

          <Pressable
            style={[styles.saveBtn, { backgroundColor: colors.primary }, savingProfile && { opacity: 0.5 }]}
            onPress={handleSaveProfile}
            disabled={savingProfile}
          >
            <Text style={styles.saveBtnText}>{savingProfile ? "Saving…" : "Save profile"}</Text>
          </Pressable>
        </View>

        {/* Appearance & Color Scheme (Independent from Study Theme) */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>App Appearance</Text>
          <Text style={[styles.hint, { color: colors.muted, marginBottom: 8 }]}>
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

        {/* Study Theme Parity Section */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Study Theme</Text>
          <Text style={[styles.hint, { color: colors.muted, marginBottom: 12 }]}>
            Choose card colors used in study sessions (Active: {activeThemeDef.label})
          </Text>
          <View style={styles.themeGrid}>
            {STUDY_THEMES.map((theme) => {
              const active = selectedTheme === theme.id;
              return (
                <Pressable
                  key={theme.id}
                  style={[
                    styles.themeChip,
                    {
                      borderColor: active ? theme.accentBorder : colors.border,
                      backgroundColor: active ? theme.cardBackBackground : colors.background,
                    },
                  ]}
                  onPress={() => handleSelectTheme(theme.id)}
                  disabled={savingTheme}
                >
                  <Text style={[styles.themeLabel, { color: colors.text, fontWeight: active ? "700" : "500" }]}>
                    {theme.label}
                  </Text>
                  <Text style={[styles.themeDesc, { color: colors.muted }]}>{theme.description}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Bounded Study Overview Analytics Summary */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Study Overview</Text>
          <View style={styles.statsGrid}>
            <StatBox label="Current streak" value={`${stats?.streak_days ?? 0} days`} colors={colors} />
            <StatBox label="Quiz time" value={formatStudyTime(stats?.total_study_time_seconds)} colors={colors} />
            <StatBox label="Decks created" value={String(stats?.flashcard_sets_count ?? 0)} colors={colors} />
            <StatBox label="Quiz attempts" value={String(stats?.quiz_count ?? 0)} colors={colors} />
          </View>
        </View>

        {/* Additional Navigation / System Actions */}
        <Pressable
          style={[styles.outlineBtn, { borderColor: colors.border, backgroundColor: colors.surface, marginHorizontal: 16, marginBottom: 10 }]}
          onPress={() => router.push("/billing")}
        >
          <Text style={[styles.outlineBtnText, { color: colors.text }]}>Billing &amp; credit usage</Text>
        </Pressable>

        <Pressable
          style={[styles.outlineBtn, { borderColor: colors.danger, backgroundColor: colors.surface, marginHorizontal: 16 }]}
          onPress={() => {
            void hapticImpact("light");
            confirmLogout();
          }}
        >
          <Text style={[styles.outlineBtnText, { color: colors.danger }]}>Log out</Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

function StatBox({
  label,
  value,
  colors,
}: {
  label: string;
  value: string;
  colors: { text: string; muted: string; background: string; border: string };
}) {
  return (
    <View style={[styles.statBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
      <Text style={[styles.statValue, { color: colors.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.muted }]}>{label}</Text>
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
  },
  sectionTitle: { fontSize: 16, fontWeight: "700", marginBottom: 12 },
  hint: { fontSize: 13, lineHeight: 18 },
  inputField: { marginBottom: 10 },
  fieldLabel: { fontSize: 12, textTransform: "uppercase", marginBottom: 4, fontWeight: "600" },
  textInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
  },
  saveBtn: {
    marginTop: 8,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
    minHeight: 44,
    justifyContent: "center",
  },
  saveBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  outlineBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    minHeight: 44,
    justifyContent: "center",
  },
  outlineBtnText: { fontWeight: "600", fontSize: 15 },
  themeGrid: { gap: 8 },
  themeChip: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  themeLabel: { fontSize: 14 },
  themeDesc: { fontSize: 12, marginTop: 2 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  statBox: {
    flex: 1,
    minWidth: "45%",
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    alignItems: "center",
  },
  statValue: { fontSize: 16, fontWeight: "700" },
  statLabel: { fontSize: 12, marginTop: 2 },
});
