import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import { api } from "../../api/client";
import { Screen } from "../../components/Screen";
import { DashboardSkeleton } from "../../components/skeletons/DashboardSkeleton";
import { AppButton, AppListRow, BrandSurface, MetricTile, ProgressRing, StatChip } from "../../components/ui";
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

function timeGreeting(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default function HomeTab() {
  const { colors } = useTheme();
  const router = useRouter();
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
  const dueCards = dueQuery.data ?? [];
  const dueCount = dueCards.length;
  const streak = summaryQuery.data?.streak_days;
  const firstSet = sets[0];
  const newUser = setsQuery.isSuccess && sets.length === 0;
  const pendingChallenges = (challengeQuery.data ?? []).filter((challenge) => (
    challenge.status === "pending" && challenge.opponent_email.toLowerCase() === (user?.email ?? "").toLowerCase()
  )).length;
  const firstName = user?.full_name?.split(" ")[0];

  const heroReady = !setsQuery.isLoading && !dueQuery.isLoading && dueQuery.isSuccess;
  const totalCards = sets.reduce((sum, set) => sum + set.card_count, 0);
  const heroProgress = heroReady
    ? (totalCards > 0 ? Math.max(0, Math.min(1, 1 - dueCount / totalCards)) : (dueCount === 0 ? 1 : 0))
    : null;

  const ratingBreakdown = summaryQuery.data?.rating_breakdown;
  const cardsReviewed = ratingBreakdown
    ? ratingBreakdown.easy + ratingBreakdown.medium + ratingBreakdown.hard
    : undefined;
  const journeyTiles: { key: string; icon: keyof typeof Ionicons.glyphMap; iconColor: string; value: number; label: string }[] = [];
  if (typeof streak === "number") {
    journeyTiles.push({ key: "streak", icon: "flame", iconColor: colors.streak, value: streak, label: "Day streak" });
  }
  if (typeof cardsReviewed === "number") {
    journeyTiles.push({ key: "reviewed", icon: "albums", iconColor: colors.primary, value: cardsReviewed, label: "Cards reviewed" });
  }

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
          <AppButton label="Try again" onPress={() => void refresh()} style={styles.retryButton} />
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
            <Text style={[styles.greeting, { color: colors.textPrimary }]}>
              {timeGreeting(new Date().getHours())}{firstName ? `, ${firstName}` : ""}
            </Text>
            <Text style={[styles.subGreeting, { color: colors.textSecondary }]}>Ready to make something stick?</Text>
          </View>
          {typeof streak === "number" ? (
            <StatChip icon="flame" label={`${streak} day${streak === 1 ? "" : "s"}`} tone="streak" accessibilityLabel={`${streak} day streak`} />
          ) : null}
        </View>

        {newUser ? (
          <BrandSurface>
            <View style={styles.heroOnboard}>
              <View style={[styles.heroIcon, { backgroundColor: `${colors.onBrand}26` }]}>
                <Ionicons name="sparkles" size={24} color={colors.onBrand} />
              </View>
              <Text style={[styles.heroDisplay, { color: colors.onBrand }]}>Create your first study material</Text>
              <Text style={[styles.heroBody, { color: `${colors.onBrand}CC` }]}>
                Upload a document, then turn its chapters into focused flashcards.
              </Text>
              <AppButton
                label="Get started"
                size="lg"
                onPress={() => router.push({ pathname: "/(tabs)/library", params: { create: "1" } })}
                style={[styles.heroCta, { backgroundColor: colors.onBrand }]}
                labelStyle={{ color: colors.primary, fontWeight: "800" }}
              />
            </View>
          </BrandSurface>
        ) : (
          <BrandSurface>
            <View style={styles.heroTopRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.heroDisplay, { color: colors.onBrand }]}>
                  {dueQuery.isLoading
                    ? "Checking today's review…"
                    : dueQuery.isError
                      ? "Review status unavailable"
                      : dueCount > 0
                        ? `${dueCount} card${dueCount === 1 ? "" : "s"} ready`
                        : "You're all caught up"}
                </Text>
                <Text style={[styles.heroBody, { color: `${colors.onBrand}CC` }]}>
                  {dueQuery.isLoading
                    ? "Your study sets are available below."
                    : dueQuery.isError
                      ? "Your study sets are still available below."
                      : dueCount > 0
                        ? "Strengthen what you're close to forgetting."
                        : "No cards are due right now."}
                </Text>
              </View>
              {heroProgress !== null ? (
                <ProgressRing progress={heroProgress} size={68} strokeWidth={6} label={`${Math.round(heroProgress * 100)}%`} accessibilityLabel="Today's review completion" />
              ) : null}
            </View>
            {!dueQuery.isLoading && dueCount > 0 ? (
              <AppButton
                label="Start review"
                size="lg"
                onPress={() => router.push("/daily-review")}
                style={[styles.heroCta, { backgroundColor: colors.onBrand }]}
                labelStyle={{ color: colors.primary, fontWeight: "800" }}
              />
            ) : dueQuery.isError ? (
              <AppButton
                label="Retry review status"
                variant="ghost"
                size="lg"
                onPress={() => void dueQuery.refetch()}
                style={[styles.heroCta, { backgroundColor: `${colors.onBrand}22`, borderWidth: 0 }]}
                labelStyle={{ color: colors.onBrand }}
              />
            ) : !dueQuery.isLoading && firstSet ? (
              <AppButton
                label={`Study ${firstSet.title}`}
                variant="ghost"
                size="lg"
                onPress={() => router.push(`/study/${firstSet.id}`)}
                style={[styles.heroCta, { backgroundColor: `${colors.onBrand}22`, borderWidth: 0 }]}
                labelStyle={{ color: colors.onBrand }}
              />
            ) : null}
          </BrandSurface>
        )}

        {sets.length > 0 ? (
          <View style={styles.section}>
            <AppListRow
              title="Continue studying"
              subtitle={dueCount > 0 ? `${dueCount} card${dueCount === 1 ? "" : "s"} waiting across your sets` : `${sets.length} set${sets.length === 1 ? "" : "s"} in your Study tab`}
              icon="school-outline"
              iconColor={colors.primary}
              iconBgColor={colors.surfaceBrand}
              onPress={() => router.push("/(tabs)/flashcards")}
              accessibilityLabel="Continue studying"
            />
          </View>
        ) : null}

        {journeyTiles.length > 0 ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Learning journey</Text>
              <Pressable hitSlop={8} onPress={() => router.push("/analytics")}>
                <Text style={[styles.link, { color: colors.primary }]}>See all</Text>
              </Pressable>
            </View>
            <View style={styles.journeyRow}>
              {journeyTiles.map((tile) => (
                <MetricTile key={tile.key} icon={tile.icon} iconColor={tile.iconColor} value={tile.value} label={tile.label} />
              ))}
            </View>
            {summaryQuery.isError ? (
              <Text style={[styles.secondaryNotice, { color: colors.textMuted }]}>Some progress details couldn't be refreshed.</Text>
            ) : null}
          </View>
        ) : null}

        {challengesEnabled ? (
          <View style={styles.section}>
            <AppListRow
              title="Challenges"
              subtitle={pendingChallenges > 0 ? `${pendingChallenges} waiting on you` : "Compete with friends"}
              icon="flash-outline"
              iconColor={colors.primary}
              iconBgColor={colors.surfaceBrand}
              onPress={() => router.push("/challenges")}
              accessibilityLabel="Challenges"
            />
            {challengeQuery.isError ? (
              <Text style={[styles.secondaryNotice, { color: colors.textMuted }]}>Some progress details couldn't be refreshed.</Text>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: TOKENS.spacing.lg, paddingBottom: TOKENS.spacing.xxxl, gap: TOKENS.spacing.xl },
  header: { flexDirection: "row", alignItems: "flex-start", gap: TOKENS.spacing.md },
  greeting: { ...TOKENS.typography.screenTitle },
  subGreeting: { ...TOKENS.typography.body, marginTop: TOKENS.spacing.xs },
  heroTopRow: { flexDirection: "row", alignItems: "flex-start", gap: TOKENS.spacing.lg },
  heroDisplay: { ...TOKENS.typography.heroDisplay },
  heroBody: { ...TOKENS.typography.body, marginTop: TOKENS.spacing.sm },
  heroOnboard: { alignItems: "flex-start" },
  heroIcon: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", marginBottom: TOKENS.spacing.lg },
  heroCta: { marginTop: TOKENS.spacing.xl, alignSelf: "flex-start", minWidth: 168 },
  retryButton: { marginTop: TOKENS.spacing.xl, minWidth: 140 },
  section: { gap: TOKENS.spacing.sm },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { ...TOKENS.typography.sectionTitle },
  link: { ...TOKENS.typography.label },
  journeyRow: { flexDirection: "row", gap: TOKENS.spacing.sm },
  secondaryNotice: { ...TOKENS.typography.caption, marginTop: TOKENS.spacing.xs },
  centerState: { flex: 1, alignItems: "center", justifyContent: "center", padding: TOKENS.spacing.xl },
  stateTitle: { ...TOKENS.typography.sectionTitle, marginTop: TOKENS.spacing.lg },
  stateBody: { ...TOKENS.typography.body, textAlign: "center", marginTop: TOKENS.spacing.sm },
});
