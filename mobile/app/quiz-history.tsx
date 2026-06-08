import { useInfiniteQuery } from "@tanstack/react-query";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";

import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "../components/PageHeader";
import { Screen } from "../components/Screen";
import { api } from "../api/client";
import { useScreenHeader } from "../hooks/useScreenHeader";
import { useTheme } from "../hooks/useTheme";
import { flattenPages, normalizePage } from "../lib/pagination";
import type { Paginated, QuizResultOut } from "../types/api";

const PAGE_SIZE = 15;

function formatTime(secs: number | null | undefined) {
  if (!secs) return "—";
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function scoreStyle(pct: number, colors: { success: string; warning: string; danger: string }) {
  if (pct >= 80) return { color: colors.success, bg: `${colors.success}22` };
  if (pct >= 50) return { color: colors.warning, bg: `${colors.warning}22` };
  return { color: colors.danger, bg: `${colors.danger}22` };
}

export default function QuizHistoryScreen() {
  const { colors } = useTheme();
  const header = useScreenHeader("Quiz Results");

  const {
    data,
    isLoading,
    isError,
    refetch,
    isRefetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["quiz-results", "history"],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const { data } = await api.get<Paginated<QuizResultOut> | QuizResultOut[]>("/quiz-results/", {
        params: { page: pageParam, size: PAGE_SIZE },
      });
      return normalizePage(data, pageParam, PAGE_SIZE);
    },
    getNextPageParam: (last) => (last.has_more ? last.page + 1 : undefined),
  });

  const results = flattenPages(data?.pages);
  const total = data?.pages[0]?.total ?? 0;

  return (
    <Screen>
      {header}
      <PageHeader title="Quiz Results" subtitle={`${total} quizzes completed`} />
      {isLoading ? (
        <Text style={[styles.center, { color: colors.muted }]}>Loading…</Text>
      ) : isError ? (
        <EmptyState
          icon="⚠️"
          title="Could not load"
          message="Check your connection and try again."
          actionLabel="Retry"
          onAction={() => refetch()}
        />
      ) : (
        <FlatList
          data={results}
          keyExtractor={(r) => r.id}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={colors.primary} />
          }
          onEndReached={() => {
            if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
          }}
          onEndReachedThreshold={0.4}
          contentContainerStyle={results.length === 0 ? styles.emptyList : styles.list}
          ListEmptyComponent={
            <EmptyState
              icon="🏆"
              title="No quizzes taken yet"
              message="Take a quiz from your flashcard sets to see results here."
            />
          }
          renderItem={({ item }) => {
            const pct = Math.round(item.percentage ?? 0);
            const badge = scoreStyle(pct, colors);
            const label = pct >= 80 ? "Excellent" : pct >= 50 ? "Good" : "Needs work";
            return (
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={[styles.scoreCircle, { backgroundColor: badge.bg }]}>
                  <Text style={[styles.scoreText, { color: badge.color }]}>{pct}%</Text>
                </View>
                <View style={styles.cardBody}>
                  <Text style={[styles.setTitle, { color: colors.text }]} numberOfLines={1}>
                    {item.set_title ?? "Quiz"}
                  </Text>
                  {item.book_title ? (
                    <Text style={[styles.bookTitle, { color: colors.muted }]} numberOfLines={1}>
                      {item.book_title}
                    </Text>
                  ) : null}
                  <Text style={[styles.meta, { color: colors.muted }]}>
                    {item.score}/{item.total_questions} correct · {formatTime(item.time_taken_seconds)}
                  </Text>
                </View>
                <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                  <Text style={[styles.badgeText, { color: badge.color }]}>{label}</Text>
                </View>
              </View>
            );
          }}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: 16, paddingBottom: 32 },
  emptyList: { flexGrow: 1 },
  center: { textAlign: "center", marginTop: 40 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
  },
  scoreCircle: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  scoreText: { fontSize: 15, fontWeight: "800" },
  cardBody: { flex: 1, minWidth: 0 },
  setTitle: { fontSize: 16, fontWeight: "600" },
  bookTitle: { fontSize: 12, marginTop: 2 },
  meta: { fontSize: 12, marginTop: 6 },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontWeight: "700" },
});
