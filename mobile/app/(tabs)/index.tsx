import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Link } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import { api } from "../../api/client";
import { Screen } from "../../components/Screen";
import { DashboardSkeleton } from "../../components/skeletons/DashboardSkeleton";
import { useTheme } from "../../hooks/useTheme";
import { fetchEntitlementsSnapshot } from "../../lib/billing";
import { fetchFlashcardSetsList } from "../../lib/flashcardSets";
import { useAuthStore } from "../../store/authStore";
import { TOKENS } from "../../theme/tokens";
import type { AnalyticsSummaryOut, DueFlashcardOut, QuizChallengeOut } from "../../types/api";

function validDueCards(value: unknown): DueFlashcardOut[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is DueFlashcardOut => (
    !!item && typeof item === "object" && typeof item.id === "string" && typeof item.set_id === "string"
  ));
}

export default function HomeTab() {
  const { colors } = useTheme();
  const user = useAuthStore((state) => state.user);
  const authenticated = useAuthStore((state) => state.bootstrapStatus === "authenticated" && !!state.accessToken);
  const refreshLock = useRef(false);
  const [refreshing, setRefreshing] = useState(false);

  const setsQuery = useQuery({
    queryKey: ["flashcard-sets"],
    queryFn: fetchFlashcardSetsList,
    enabled: authenticated,
  });
  const dueQuery = useQuery({
    queryKey: ["daily-review-queue", user?.id, "home"],
    queryFn: async () => {
      const { data } = await api.get<unknown>("/study/daily-review", { params: { limit: 200 } });
      return validDueCards(data);
    },
    enabled: authenticated,
  });
  const summaryQuery = useQuery({
    queryKey: ["analytics-summary"],
    queryFn: async () => (await api.get<AnalyticsSummaryOut>("/analytics/summary")).data,
    enabled: authenticated,
  });
  const entitlementQuery = useQuery({
    queryKey: ["billing-entitlements"],
    queryFn: fetchEntitlementsSnapshot,
    enabled: authenticated,
  });
  const challengesEnabled = entitlementQuery.data?.features?.challenges === true;
  const challengeQuery = useQuery({
    queryKey: ["quiz-challenges"],
    queryFn: async () => (await api.get<QuizChallengeOut[]>("/quiz-challenges/")).data,
    enabled: authenticated && challengesEnabled,
  });

  const sets = setsQuery.data ?? [];
  const dueCount = dueQuery.data?.length ?? 0;
  const streak = summaryQuery.data?.streak_days;
  const firstSet = sets[0];
  const newUser = setsQuery.isSuccess && sets.length === 0;
  const pendingChallenges = (challengeQuery.data ?? []).filter((challenge) => (
    challenge.status === "pending" && challenge.opponent_email.toLowerCase() === (user?.email ?? "").toLowerCase()
  )).length;

  const refresh = useCallback(async () => {
    if (refreshLock.current) return;
    refreshLock.current = true;
    setRefreshing(true);
    try {
      await Promise.allSettled([
        setsQuery.refetch(), dueQuery.refetch(), summaryQuery.refetch(), entitlementQuery.refetch(),
        challengesEnabled ? challengeQuery.refetch() : Promise.resolve(),
      ]);
    } finally {
      refreshLock.current = false;
      setRefreshing(false);
    }
  }, [challengeQuery, challengesEnabled, dueQuery, entitlementQuery, setsQuery, summaryQuery]);

  if (setsQuery.isLoading && !setsQuery.data) {
    return <Screen><DashboardSkeleton /></Screen>;
  }

  if (setsQuery.isError && !setsQuery.data) {
    return (
      <Screen>
        <View style={styles.centerState}>
          <Ionicons name="cloud-offline-outline" size={42} color={colors.textMuted} />
          <Text style={[styles.stateTitle, { color: colors.text }]}>Home is unavailable</Text>
          <Text style={[styles.stateBody, { color: colors.textSecondary }]}>Check your connection and try again.</Text>
          <Pressable style={[styles.primaryButton, { backgroundColor: colors.primary }]} onPress={() => void refresh()}>
            <Text style={[styles.primaryLabel, { color: colors.onPrimary }]}>Try again</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={["top", "left", "right"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={colors.primary} />}
      >
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.eyebrow, { color: colors.primary }]}>HOME</Text>
            <Text style={[styles.title, { color: colors.text }]}>Welcome back{user?.full_name ? `, ${user.full_name.split(" ")[0]}` : ""}</Text>
          </View>
          {typeof streak === "number" ? (
            <View style={[styles.streak, { backgroundColor: colors.surfaceMuted }]} accessibilityLabel={`${streak} day streak`}>
              <Ionicons name="flame" size={17} color={colors.streak} />
              <Text style={[styles.streakText, { color: colors.text }]}>{streak} day{streak === 1 ? "" : "s"}</Text>
            </View>
          ) : null}
        </View>

        {newUser ? (
          <View style={[styles.hero, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.heroIcon, { backgroundColor: colors.primarySoft }]}><Ionicons name="sparkles" size={24} color={colors.primary} /></View>
            <Text style={[styles.heroTitle, { color: colors.text }]}>Create your first study material</Text>
            <Text style={[styles.heroBody, { color: colors.textSecondary }]}>Upload a document, then turn its chapters into focused flashcards.</Text>
            <Link href={{ pathname: "/(tabs)/library", params: { create: "1" } }} asChild>
              <Pressable style={[styles.primaryButton, { backgroundColor: colors.primary }]}>
                <Text style={[styles.primaryLabel, { color: colors.onPrimary }]}>Get started</Text>
              </Pressable>
            </Link>
          </View>
        ) : (
          <View style={[styles.hero, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.heroKicker, { color: dueCount > 0 ? colors.primary : colors.success }]}>TODAY</Text>
            <Text style={[styles.heroTitle, { color: colors.text }]}>
              {dueQuery.isLoading
                ? "Checking today's review…"
                : dueQuery.isError
                  ? "Review status unavailable"
                  : dueCount > 0
                    ? `${dueCount} card${dueCount === 1 ? "" : "s"} ready to review`
                    : "You're caught up"}
            </Text>
            <Text style={[styles.heroBody, { color: colors.textSecondary }]}>
              {dueQuery.isLoading
                ? "Your study sets are available below."
                : dueQuery.isError
                  ? "Your study sets are still available below."
                  : dueCount > 0
                    ? "Start with the review cards available now."
                    : "No cards are due right now."}
            </Text>
            {!dueQuery.isLoading && dueCount > 0 ? (
              <Link href="/daily-review" asChild>
                <Pressable style={[styles.primaryButton, { backgroundColor: colors.primary }]}>
                  <Text style={[styles.primaryLabel, { color: colors.onPrimary }]}>Start Review</Text>
                </Pressable>
              </Link>
            ) : dueQuery.isError ? (
              <Pressable style={[styles.secondaryButton, { borderColor: colors.borderStrong }]} onPress={() => void dueQuery.refetch()}>
                <Text style={[styles.secondaryLabel, { color: colors.text }]}>Retry review status</Text>
              </Pressable>
            ) : firstSet ? (
              <Link href={`/study/${firstSet.id}`} asChild>
                <Pressable style={[styles.secondaryButton, { borderColor: colors.borderStrong }]}>
                  <Text style={[styles.secondaryLabel, { color: colors.text }]}>Study {firstSet.title}</Text>
                </Pressable>
              </Link>
            ) : null}
          </View>
        )}

        {sets.length > 0 ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Your study sets</Text>
              <Link href="/(tabs)/flashcards" asChild><Pressable hitSlop={8}><Text style={[styles.link, { color: colors.primary }]}>See all</Text></Pressable></Link>
            </View>
            {sets.slice(0, 3).map((set) => (
              <Link key={set.id} href={`/study/${set.id}`} asChild>
                <Pressable style={({ pressed }) => [styles.row, { borderBottomColor: colors.border, opacity: pressed ? 0.65 : 1 }]} accessibilityLabel={`Study ${set.title}`}>
                  <View style={[styles.rowIcon, { backgroundColor: colors.primarySoft }]}><Ionicons name="albums-outline" size={20} color={colors.primary} /></View>
                  <View style={{ flex: 1 }}><Text style={[styles.rowTitle, { color: colors.text }]} numberOfLines={2}>{set.title}</Text><Text style={[styles.rowMeta, { color: colors.textSecondary }]}>{set.card_count} cards{set.book_title ? ` · ${set.book_title}` : ""}</Text></View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </Pressable>
              </Link>
            ))}
          </View>
        ) : null}

        {(challengesEnabled || summaryQuery.data) ? (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>More progress</Text>
            <View style={[styles.engagement, { backgroundColor: colors.surfaceMuted }]}>
              {challengesEnabled ? <Link href="/challenges" asChild><Pressable style={styles.engagementItem}><Ionicons name="flash-outline" size={21} color={colors.primary} /><Text style={[styles.engagementText, { color: colors.text }]}>Challenges{pendingChallenges > 0 ? ` · ${pendingChallenges} waiting` : ""}</Text></Pressable></Link> : null}
              <Link href="/analytics" asChild><Pressable style={styles.engagementItem}><Ionicons name="analytics-outline" size={21} color={colors.info} /><Text style={[styles.engagementText, { color: colors.text }]}>Learning progress</Text></Pressable></Link>
            </View>
            {(challengeQuery.isError || summaryQuery.isError) ? <Text style={[styles.secondaryNotice, { color: colors.textMuted }]}>Some progress details couldn't be refreshed.</Text> : null}
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: TOKENS.spacing.lg, paddingBottom: TOKENS.spacing.xxxl, gap: TOKENS.spacing.xl },
  header: { flexDirection: "row", alignItems: "center", gap: TOKENS.spacing.md },
  eyebrow: { ...TOKENS.typography.caption, letterSpacing: 1.2 },
  title: { ...TOKENS.typography.screenTitle, marginTop: TOKENS.spacing.xs },
  streak: { minHeight: 44, borderRadius: TOKENS.radii.pill, paddingHorizontal: TOKENS.spacing.md, flexDirection: "row", alignItems: "center", gap: 6 },
  streakText: { ...TOKENS.typography.label },
  hero: { borderWidth: 1, borderRadius: TOKENS.radii.xl, padding: TOKENS.spacing.xl },
  heroIcon: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", marginBottom: TOKENS.spacing.lg },
  heroKicker: { ...TOKENS.typography.caption, letterSpacing: 1.1, marginBottom: TOKENS.spacing.sm },
  heroTitle: { ...TOKENS.typography.screenTitle },
  heroBody: { ...TOKENS.typography.body, marginTop: TOKENS.spacing.sm, marginBottom: TOKENS.spacing.xl },
  primaryButton: { minHeight: 48, borderRadius: TOKENS.radii.md, alignItems: "center", justifyContent: "center", paddingHorizontal: TOKENS.spacing.lg, marginTop: TOKENS.spacing.lg },
  primaryLabel: { ...TOKENS.typography.buttonLabel },
  secondaryButton: { minHeight: 48, borderRadius: TOKENS.radii.md, borderWidth: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: TOKENS.spacing.lg, marginTop: TOKENS.spacing.lg },
  secondaryLabel: { ...TOKENS.typography.buttonLabel, textAlign: "center" },
  section: { gap: TOKENS.spacing.sm },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { ...TOKENS.typography.sectionTitle },
  link: { ...TOKENS.typography.label },
  row: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: TOKENS.spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: TOKENS.spacing.md },
  rowIcon: { width: 42, height: 42, borderRadius: TOKENS.radii.md, alignItems: "center", justifyContent: "center" },
  rowTitle: { ...TOKENS.typography.bodyEmphasis },
  rowMeta: { ...TOKENS.typography.caption, marginTop: 3 },
  engagement: { borderRadius: TOKENS.radii.lg, paddingHorizontal: TOKENS.spacing.md },
  engagementItem: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: TOKENS.spacing.md },
  engagementText: { ...TOKENS.typography.bodyEmphasis },
  secondaryNotice: { ...TOKENS.typography.caption },
  centerState: { flex: 1, alignItems: "center", justifyContent: "center", padding: TOKENS.spacing.xl },
  stateTitle: { ...TOKENS.typography.sectionTitle, marginTop: TOKENS.spacing.lg },
  stateBody: { ...TOKENS.typography.body, textAlign: "center", marginTop: TOKENS.spacing.sm },
});
