import { useQuery } from "@tanstack/react-query";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "../components/PageHeader";
import { Screen } from "../components/Screen";
import { WeakTopicsChips } from "../components/WeakTopicsChips";
import { api } from "../api/client";
import { useScreenHeader } from "../hooks/useScreenHeader";
import { useTheme } from "../hooks/useTheme";
import type { AnalyticsSummaryOut } from "../types/api";

export default function AnalyticsScreen() {
  const { colors } = useTheme();
  const header = useScreenHeader("Analytics");

  const { data: summary, isLoading, isError, refetch } = useQuery({
    queryKey: ["analytics-me"],
    queryFn: async () => {
      const { data } = await api.get<AnalyticsSummaryOut>("/analytics/me");
      return data;
    },
  });

  const rating = summary?.rating_breakdown ?? { easy: 0, medium: 0, hard: 0 };
  const ratingTotal = rating.easy + rating.medium + rating.hard;
  const trend = (summary?.score_trend ?? []).filter((_, i) => i % 2 === 0).slice(-7);

  return (
    <Screen>
      {header}
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <PageHeader title="Progress Analytics" subtitle="Track your learning over time" />

        {isLoading ? (
          <Text style={[styles.center, { color: colors.muted }]}>Loading…</Text>
        ) : isError ? (
          <EmptyState
            icon="⚠️"
            title="Could not load analytics"
            message="Check your connection and try again."
            actionLabel="Retry"
            onAction={() => refetch()}
          />
        ) : (
          <>
            <View style={styles.statsGrid}>
              {[
                { label: "Quizzes Taken", value: String(summary?.quiz_count ?? 0) },
                { label: "Avg Score", value: `${Math.round(summary?.avg_score ?? 0)}%` },
                { label: "Cards Mastered", value: String(summary?.cards_mastered_easy_band ?? 0) },
                { label: "Sets Studied", value: String(summary?.flashcard_sets_count ?? 0) },
              ].map((stat) => (
                <View
                  key={stat.label}
                  style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                >
                  <Text style={[styles.statValue, { color: colors.text }]}>{stat.value}</Text>
                  <Text style={[styles.statLabel, { color: colors.muted }]}>{stat.label}</Text>
                </View>
              ))}
            </View>

            <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Score trend (recent)</Text>
              {trend.length === 0 || (summary?.quiz_count ?? 0) === 0 ? (
                <Text style={[styles.emptyHint, { color: colors.muted }]}>No quiz data yet</Text>
              ) : (
                trend.map((day) => (
                  <View key={day.day} style={styles.trendRow}>
                    <Text style={[styles.trendLabel, { color: colors.muted }]}>{day.label}</Text>
                    <View style={[styles.trendTrack, { backgroundColor: colors.border }]}>
                      <View
                        style={[
                          styles.trendFill,
                          {
                            width: `${day.avg_score ?? 0}%`,
                            backgroundColor: colors.primary,
                          },
                        ]}
                      />
                    </View>
                    <Text style={[styles.trendValue, { color: colors.text }]}>
                      {day.avg_score != null ? `${Math.round(day.avg_score)}%` : "—"}
                    </Text>
                  </View>
                ))
              )}
            </View>

            <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Cards by difficulty</Text>
              {ratingTotal === 0 ? (
                <Text style={[styles.emptyHint, { color: colors.muted }]}>Rate some cards to see data</Text>
              ) : (
                [
                  { key: "easy", label: "Easy", value: rating.easy, color: colors.success },
                  { key: "medium", label: "Medium", value: rating.medium, color: colors.warning },
                  { key: "hard", label: "Hard", value: rating.hard, color: colors.danger },
                ].map((row) => (
                  <View key={row.key} style={styles.trendRow}>
                    <Text style={[styles.trendLabel, { color: colors.muted }]}>{row.label}</Text>
                    <View style={[styles.trendTrack, { backgroundColor: colors.border }]}>
                      <View
                        style={[
                          styles.trendFill,
                          {
                            width: `${Math.round((row.value / ratingTotal) * 100)}%`,
                            backgroundColor: row.color,
                          },
                        ]}
                      />
                    </View>
                    <Text style={[styles.trendValue, { color: colors.text }]}>{row.value}</Text>
                  </View>
                ))
              )}
            </View>

            <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Weak topics</Text>
              {(summary?.weak_topics ?? []).length === 0 ? (
                <Text style={[styles.emptyHint, { color: colors.muted }]}>
                  Take some quizzes to see your weak areas
                </Text>
              ) : (
                <>
                  <WeakTopicsChips topics={summary?.weak_topics ?? []} />
                  {(summary?.weak_topics ?? []).map((t) => (
                    <View key={t.set_id} style={styles.weakRow}>
                      <Text style={[styles.weakTitle, { color: colors.text }]} numberOfLines={1}>
                        {t.title}
                      </Text>
                      <View style={[styles.trendTrack, { flex: 1, backgroundColor: colors.border }]}>
                        <View
                          style={[
                            styles.trendFill,
                            {
                              width: `${t.avg_score}%`,
                              backgroundColor:
                                t.avg_score >= 80
                                  ? colors.success
                                  : t.avg_score >= 50
                                    ? colors.warning
                                    : colors.danger,
                            },
                          ]}
                        />
                      </View>
                      <Text style={[styles.trendValue, { color: colors.text }]}>{t.avg_score}%</Text>
                    </View>
                  ))}
                </>
              )}
            </View>

            <View style={[styles.streakCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.statValue, { color: colors.primary }]}>{summary?.streak_days ?? 0}</Text>
              <Text style={[styles.statLabel, { color: colors.muted }]}>Day study streak</Text>
            </View>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 32 },
  center: { textAlign: "center", marginTop: 24 },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  statCard: {
    width: "47%",
    flexGrow: 1,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  statValue: { fontSize: 22, fontWeight: "800" },
  statLabel: { fontSize: 12, marginTop: 4, fontWeight: "600" },
  section: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  sectionTitle: { fontSize: 16, fontWeight: "700", marginBottom: 12 },
  emptyHint: { fontSize: 14, textAlign: "center", paddingVertical: 16 },
  trendRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  trendLabel: { width: 52, fontSize: 12 },
  trendTrack: { flex: 1, height: 8, borderRadius: 4, overflow: "hidden" },
  trendFill: { height: 8, borderRadius: 4 },
  trendValue: { width: 40, fontSize: 12, fontWeight: "700", textAlign: "right" },
  weakRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 },
  weakTitle: { width: 100, fontSize: 13, fontWeight: "600" },
  streakCard: {
    marginHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    alignItems: "center",
  },
});
