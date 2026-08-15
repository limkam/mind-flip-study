import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useMemo } from "react";
import { Animated, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import { api } from "../../api/client";
import { Screen } from "../../components/Screen";
import { StudySkeleton } from "../../components/skeletons/StudySkeleton";
import { AppBadge, AppButton, BrandSurface, MetricTile, ProgressRing, StackCard, StatChip } from "../../components/ui";
import { usePressScale } from "../../hooks/usePressScale";
import { useTheme } from "../../hooks/useTheme";
import { coverTintFor, type CoverTint } from "../../lib/coverTint";
import { fetchFlashcardSetsList } from "../../lib/flashcardSets";
import { useAuthStore } from "../../store/authStore";
import { TOKENS } from "../../theme/tokens";
import type { AnalyticsSummaryOut, DueFlashcardOut, FlashcardSetOut } from "../../types/api";

const CARD_WIDTH = 208;
const CARD_HEIGHT = 176;

function validDueCards(value: unknown): DueFlashcardOut[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is DueFlashcardOut => (
    !!item && typeof item === "object" && typeof item.id === "string" && typeof item.set_id === "string"
  ));
}

function JumpBackInCard({ set, dueCount, tint }: { set: FlashcardSetOut; dueCount: number; tint: CoverTint }) {
  const { colors } = useTheme();
  const router = useRouter();
  const { scale, onPressIn, onPressOut } = usePressScale();
  const initial = set.title.trim().charAt(0).toUpperCase() || "?";

  return (
    <StackCard width={CARD_WIDTH} height={CARD_HEIGHT}>
      <Animated.View style={{ transform: [{ scale }] }}>
        <Pressable
          onPress={() => router.push(`/study/${set.id}`)}
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          accessibilityRole="button"
          accessibilityLabel={`Study ${set.title}, ${set.card_count} cards`}
          style={[styles.setCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
        >
          <View style={[styles.setCover, { backgroundColor: tint.bg }]}>
            <Text style={[styles.setCoverGlyph, { color: tint.fg }]}>{initial}</Text>
            {dueCount > 0 ? (
              <AppBadge label={`${dueCount} due`} variant="warning" style={styles.setCoverBadge} />
            ) : null}
          </View>
          <View style={styles.setBody}>
            <Text style={[styles.setTitle, { color: colors.textPrimary }]} numberOfLines={2}>{set.title}</Text>
            <Text style={[styles.setMeta, { color: colors.textMuted }]} numberOfLines={1}>
              {set.card_count} card{set.card_count === 1 ? "" : "s"}{set.book_title ? ` · ${set.book_title}` : ""}
            </Text>
          </View>
        </Pressable>
      </Animated.View>
    </StackCard>
  );
}

export default function StudyTab() {
  const { colors } = useTheme();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const authenticated = useAuthStore((state) => state.bootstrapStatus === "authenticated" && !!state.accessToken);

  const setsQuery = useQuery({
    queryKey: ["flashcard-sets"],
    queryFn: fetchFlashcardSetsList,
    enabled: authenticated,
  });
  const dueQuery = useQuery({
    queryKey: ["daily-review-queue", user?.id, "study-tab"],
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

  const sets = setsQuery.data ?? [];
  const dueCards = dueQuery.data ?? [];
  const dueCount = dueCards.length;
  const streak = summaryQuery.data?.streak_days;
  const cardsReviewedToday = summaryQuery.data?.cards_reviewed_today;

  const dueBySet = useMemo(() => {
    const map = new Map<string, number>();
    for (const card of dueCards) {
      map.set(card.set_id, (map.get(card.set_id) ?? 0) + 1);
    }
    return map;
  }, [dueCards]);

  const recentSets = useMemo(
    () =>
      sets
        .filter((s): s is FlashcardSetOut & { last_studied_at: string } => !!s.last_studied_at)
        .sort((a, b) => new Date(b.last_studied_at).getTime() - new Date(a.last_studied_at).getTime())
        .slice(0, 10),
    [sets],
  );

  const heroReady = !setsQuery.isLoading && !dueQuery.isLoading && dueQuery.isSuccess;
  const totalCards = sets.reduce((sum, set) => sum + set.card_count, 0);
  const heroProgress = heroReady
    ? (totalCards > 0 ? Math.max(0, Math.min(1, 1 - dueCount / totalCards)) : (dueCount === 0 ? 1 : 0))
    : null;

  const refreshing = setsQuery.isRefetching || dueQuery.isRefetching || summaryQuery.isRefetching;
  const refresh = () => {
    void setsQuery.refetch();
    void dueQuery.refetch();
    void summaryQuery.refetch();
  };

  if (setsQuery.isLoading && !setsQuery.data) {
    return <Screen><StudySkeleton /></Screen>;
  }

  if (setsQuery.isError && !setsQuery.data) {
    return (
      <Screen>
        <View style={styles.centerState}>
          <Ionicons name="cloud-offline-outline" size={42} color={colors.textMuted} />
          <Text style={[styles.stateTitle, { color: colors.text }]}>Study is unavailable</Text>
          <Text style={[styles.stateBody, { color: colors.textSecondary }]}>Check your connection and try again.</Text>
          <AppButton label="Try again" onPress={() => void setsQuery.refetch()} style={styles.retryButton} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={["top", "left", "right"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Study</Text>
          {typeof streak === "number" ? (
            <StatChip icon="flame" label={`${streak} day${streak === 1 ? "" : "s"}`} tone="streak" accessibilityLabel={`${streak} day streak`} />
          ) : null}
        </View>

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
                  ? "Loading your due cards."
                  : dueQuery.isError
                    ? "Pull down to try again."
                    : dueCount > 0
                      ? "Strengthen what you're close to forgetting."
                      : "No cards are due right now."}
              </Text>
            </View>
            {heroProgress !== null ? (
              <ProgressRing progress={heroProgress} size={68} strokeWidth={6} label={`${Math.round(heroProgress * 100)}%`} accessibilityLabel="Today's review completion" />
            ) : null}
          </View>
          {!dueQuery.isLoading ? (
            <AppButton
              label="Start review"
              size="lg"
              onPress={() => router.push("/daily-review")}
              style={[styles.heroCta, { backgroundColor: colors.onBrand }]}
              labelStyle={{ color: colors.primary, fontWeight: "800" }}
            />
          ) : null}
        </BrandSurface>

        <View style={styles.progressStrip}>
          <MetricTile icon="flame" iconColor={colors.streak} value={typeof streak === "number" ? streak : "–"} label="Day streak" />
          <MetricTile icon="checkmark-done" iconColor={colors.primary} value={typeof cardsReviewedToday === "number" ? cardsReviewedToday : "–"} label="Reviewed today" />
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Jump back in</Text>
          {recentSets.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              decelerationRate="fast"
              snapToInterval={CARD_WIDTH + TOKENS.spacing.md}
              contentContainerStyle={styles.carousel}
            >
              {recentSets.map((set) => (
                <JumpBackInCard
                  key={set.id}
                  set={set}
                  dueCount={dueBySet.get(set.id) ?? 0}
                  tint={coverTintFor(set.id, colors)}
                />
              ))}
            </ScrollView>
          ) : (
            <Pressable onPress={() => router.push("/(tabs)/library")} accessibilityRole="button" accessibilityLabel="Go to Library">
              <Text style={[styles.emptyJumpBackIn, { color: colors.textSecondary }]}>
                Study a set to see it here — head to <Text style={{ color: colors.primary, fontWeight: "700" }}>Library</Text> to pick one.
              </Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: TOKENS.spacing.lg, paddingBottom: TOKENS.spacing.xxxl, gap: TOKENS.spacing.lg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: TOKENS.spacing.sm },
  title: { ...TOKENS.typography.screenTitle },
  heroTopRow: { flexDirection: "row", alignItems: "center", gap: TOKENS.spacing.md },
  heroDisplay: { fontSize: 20, fontWeight: "800" },
  heroBody: { fontSize: 14, marginTop: 4 },
  heroCta: { marginTop: TOKENS.spacing.lg, borderWidth: 0 },
  progressStrip: { flexDirection: "row", gap: TOKENS.spacing.md },
  section: { gap: TOKENS.spacing.sm },
  sectionTitle: { ...TOKENS.typography.sectionTitle },
  carousel: { gap: TOKENS.spacing.md, paddingRight: TOKENS.spacing.lg },
  emptyJumpBackIn: { ...TOKENS.typography.body, lineHeight: 20 },
  setCard: { width: CARD_WIDTH, height: CARD_HEIGHT, borderRadius: TOKENS.radii.lg, borderWidth: 1, overflow: "hidden" },
  setCover: { height: CARD_HEIGHT * 0.55, alignItems: "center", justifyContent: "center" },
  setCoverGlyph: { fontSize: 32, fontWeight: "800" },
  setCoverBadge: { position: "absolute", top: TOKENS.spacing.sm, right: TOKENS.spacing.sm },
  setBody: { flex: 1, padding: TOKENS.spacing.md, justifyContent: "center" },
  setTitle: { ...TOKENS.typography.bodyEmphasis },
  setMeta: { ...TOKENS.typography.caption, marginTop: 4 },
  centerState: { flex: 1, alignItems: "center", justifyContent: "center", padding: TOKENS.spacing.xl },
  stateTitle: { ...TOKENS.typography.sectionTitle, textAlign: "center", marginTop: TOKENS.spacing.md },
  stateBody: { ...TOKENS.typography.body, textAlign: "center", marginTop: TOKENS.spacing.sm, maxWidth: 340 },
  retryButton: { marginTop: TOKENS.spacing.lg },
});
