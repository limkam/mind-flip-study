import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import { EmptyState } from "../components/EmptyState";
import { ChallengeEntitlementGuard } from "../components/ChallengeEntitlementGuard";
import { PageHeader } from "../components/PageHeader";
import { Screen } from "../components/Screen";
import { api } from "../api/client";
import { unlockedBadgeList, type AchievementRow } from "../lib/achievementBadges";
import { fetchFlashcardSetsList } from "../lib/flashcardSets";
import { useScreenHeader } from "../hooks/useScreenHeader";
import { useTheme } from "../hooks/useTheme";
import { useAuthStore } from "../store/authStore";
import type { AnalyticsSummaryOut, QuizChallengeOut } from "../types/api";

type OverallRow = {
  rank: number;
  user_id: string;
  full_name: string;
  points: number;
  accuracy: number;
  activity: number;
  wins: number;
};

const TABS = [
  { id: "overall", label: "Overall" },
  { id: "by_content", label: "By Content" },
  { id: "badges", label: "Badges" },
] as const;

export default function ChallengeLeaderboardScreen() {
  return (
    <ChallengeEntitlementGuard>
      <ChallengeLeaderboardContent />
    </ChallengeEntitlementGuard>
  );
}

function ChallengeLeaderboardContent() {
  const { colors } = useTheme();
  const header = useScreenHeader("Challenge Board");
  const userId = useAuthStore((s) => s.user?.id);
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("overall");

  const overallQuery = useQuery({
    queryKey: ["challenge-leaderboard", "overall"],
    enabled: tab === "overall",
    queryFn: async () => {
      const { data } = await api.get<{ items: OverallRow[] }>("/challenge-leaderboard/overall", {
        params: { page: 1, size: 50 },
      });
      return data.items ?? [];
    },
  });

  const contentQuery = useQuery({
    queryKey: ["challenge-leaderboard", "by-content"],
    enabled: tab === "by_content",
    queryFn: async () => {
      const { data } = await api.get<{ content_label: string; full_name: string; points: number; accuracy: number }[]>(
        "/challenge-leaderboard/by-content",
        { params: { limit: 30 } },
      );
      return data ?? [];
    },
  });

  const userEmail = useAuthStore((s) => s.user?.email);
  const badgesTab = tab === "badges";

  const earnedQuery = useQuery({
    queryKey: ["achievements", userEmail],
    enabled: badgesTab && !!userEmail,
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async () => {
      const { data } = await api.get<AchievementRow[]>("/achievements/");
      return data ?? [];
    },
  });

  const summaryQuery = useQuery({
    queryKey: ["analytics-summary"],
    enabled: badgesTab,
    queryFn: async () => {
      const { data } = await api.get<AnalyticsSummaryOut>("/analytics/summary");
      return data;
    },
  });

  const flashcardSetsQuery = useQuery({
    queryKey: ["flashcard-sets"],
    enabled: badgesTab,
    queryFn: fetchFlashcardSetsList,
  });

  const challengesQuery = useQuery({
    queryKey: ["quiz-challenges"],
    enabled: badgesTab,
    queryFn: async () => {
      const { data } = await api.get<QuizChallengeOut[]>("/quiz-challenges/");
      return data ?? [];
    },
  });

  const badges = useMemo(() => {
    if (!badgesTab) return [];
    const stats = {
      quizCount: summaryQuery.data?.quiz_count ?? 0,
      hasPerfect: !!summaryQuery.data?.has_perfect_quiz,
      streak: summaryQuery.data?.streak_days ?? 0,
      totalCards: (flashcardSetsQuery.data ?? []).reduce((n, s) => n + (s.card_count ?? 0), 0),
      challengesSent: (challengesQuery.data ?? []).filter((c) => c.challenger_email === userEmail).length,
    };
    return unlockedBadgeList(earnedQuery.data ?? [], stats);
  }, [badgesTab, earnedQuery.data, summaryQuery.data, flashcardSetsQuery.data, challengesQuery.data, userEmail]);

  const loading =
    tab === "overall"
      ? overallQuery.isLoading
      : tab === "by_content"
        ? contentQuery.isLoading
        : earnedQuery.isLoading || summaryQuery.isLoading || flashcardSetsQuery.isLoading || challengesQuery.isLoading;

  return (
    <Screen>
      {header}
      <PageHeader title="Challenge Board" subtitle="Competition rankings and badges" />
      <View style={[styles.tabs, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {TABS.map((t) => (
          <Pressable
            key={t.id}
            style={[styles.tab, tab === t.id && { backgroundColor: colors.background }]}
            onPress={() => setTab(t.id)}
          >
            <Text style={{ color: tab === t.id ? colors.text : colors.muted, fontWeight: "600", fontSize: 13 }}>
              {t.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <Text style={[styles.center, { color: colors.muted }]}>Loading…</Text>
      ) : tab === "overall" ? (
        <FlatList
          data={overallQuery.data ?? []}
          keyExtractor={(row) => row.user_id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<EmptyState icon="🏆" title="No rankings yet" message="Complete quizzes to appear on the board." />}
          renderItem={({ item }) => (
            <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }, item.user_id === userId && { borderColor: colors.primary }]}>
              <Text style={[styles.rank, { color: colors.primary }]}>#{item.rank}</Text>
              <View style={styles.rowBody}>
                <Text style={{ color: colors.text, fontWeight: "700" }}>
                  {item.full_name}{item.user_id === userId ? " (you)" : ""}
                </Text>
                <Text style={{ color: colors.muted, fontSize: 13 }}>
                  {item.points} pts · {item.accuracy}% avg · {item.wins} wins
                </Text>
              </View>
            </View>
          )}
        />
      ) : tab === "by_content" ? (
        <FlatList
          data={contentQuery.data ?? []}
          keyExtractor={(row, i) => `${row.full_name}-${row.content_label}-${i}`}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<EmptyState icon="📚" title="No content rankings" message="Complete challenges for a flashcard set to appear in content rankings." />}
          renderItem={({ item }) => (
            <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.rowBody}>
                <Text style={{ color: colors.text, fontWeight: "700" }}>{item.full_name}</Text>
                <Text style={{ color: colors.muted, fontSize: 13 }}>{item.content_label}</Text>
                <Text style={{ color: colors.muted, fontSize: 13 }}>{item.points} pts · {item.accuracy}%</Text>
              </View>
            </View>
          )}
        />
      ) : (
        <FlatList
          data={badges}
          keyExtractor={(b) => b.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <EmptyState
              icon="🎖️"
              title="No badges yet"
              message="Complete quizzes to earn achievements."
            />
          }
          renderItem={({ item }) => (
            <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={styles.badgeIcon}>{item.icon}</Text>
              <View style={styles.rowBody}>
                <Text style={{ color: colors.text, fontWeight: "700" }}>{item.title}</Text>
                <Text style={{ color: colors.muted, fontSize: 13 }}>{item.description}</Text>
              </View>
            </View>
          )}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: "row", marginHorizontal: 16, marginBottom: 12, borderRadius: 12, borderWidth: 1, padding: 4 },
  tab: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 8 },
  list: { paddingHorizontal: 16, paddingBottom: 32 },
  center: { textAlign: "center", marginTop: 24 },
  row: { flexDirection: "row", gap: 12, borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8, alignItems: "center" },
  rank: { fontSize: 16, fontWeight: "800", width: 36 },
  rowBody: { flex: 1 },
  badgeIcon: { fontSize: 28 },
});
