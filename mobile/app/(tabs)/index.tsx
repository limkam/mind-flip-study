import { useQuery } from "@tanstack/react-query";
import { Link } from "expo-router";
import { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { AchievementsPanel } from "../../components/AchievementsPanel";
import { Screen } from "../../components/Screen";
import { WeakTopicsChips } from "../../components/WeakTopicsChips";
import { DashboardSkeleton } from "../../components/skeletons/DashboardSkeleton";
import { api } from "../../api/client";
import { fetchFlashcardSetsList } from "../../lib/flashcardSets";
import { useTheme } from "../../hooks/useTheme";
import { hapticImpact } from "../../lib/haptics";
import { useAuthStore } from "../../store/authStore";
import type { AnalyticsSummaryOut } from "../../types/api";
import type { AchievementStats } from "../../lib/achievements";

type ChallengeRow = {
  challenger_email?: string;
  status?: string;
  opponent_email?: string;
};

export default function DashboardTab() {
  const { colors } = useTheme();
  const user = useAuthStore((s) => s.user);

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ["analytics-summary"],
    queryFn: async () => {
      const { data } = await api.get<AnalyticsSummaryOut>("/analytics/summary");
      return data;
    },
  });

  const { data: flashcardSets = [], isLoading: setsLoading } = useQuery({
    queryKey: ["flashcard-sets"],
    queryFn: fetchFlashcardSetsList,
    staleTime: 0,
  });

  const { data: challenges = [] } = useQuery({
    queryKey: ["quiz-challenges"],
    queryFn: async () => {
      const { data } = await api.get<ChallengeRow[]>("/quiz-challenges/");
      return data;
    },
  });

  const stats: AchievementStats = useMemo(() => {
    const totalCards = flashcardSets.reduce((sum, s) => sum + (s.card_count ?? 0), 0);
    const challengesSent = challenges.filter((c) => c.challenger_email === user?.email).length;
    return {
      quizCount: summary?.quiz_count ?? 0,
      hasPerfect: !!summary?.has_perfect_quiz,
      streak: summary?.streak_days ?? 0,
      totalCards,
      challengesSent,
    };
  }, [summary, flashcardSets, challenges, user?.email]);

  const weakTopics = summary?.weak_topics ?? [];

  if (summaryLoading || setsLoading) {
    return (
      <Screen>
        <DashboardSkeleton />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.greeting, { color: colors.text }]}>
          Hi, {user?.full_name?.split(" ")[0] ?? "Learner"}
        </Text>
        <Text style={[styles.sub, { color: colors.muted }]}>Your progress at a glance</Text>

        <View style={styles.statsRow}>
          {[
            { label: "Sets", value: flashcardSets.length },
            { label: "Quizzes", value: summary?.quiz_count ?? 0 },
            { label: "Avg score", value: `${Math.round(summary?.avg_score ?? 0)}%` },
            { label: "Streak", value: summary?.streak_days ?? 0 },
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

        <WeakTopicsChips topics={weakTopics} />

        <View style={styles.quickLinks}>
          {[
            { label: "Daily Review", href: "/daily-review" as const },
            { label: "Quiz Results", href: "/quiz-history" as const },
            { label: "Leaderboard", href: "/leaderboard" as const },
            { label: "All sections", href: "/(tabs)/more" as const },
          ].map((item) => (
            <Link key={item.href} href={item.href} asChild>
              <Pressable
                style={[styles.quickChip, { borderColor: colors.border, backgroundColor: colors.surface }]}
                onPress={() => void hapticImpact("light")}
              >
                <Text style={[styles.quickChipText, { color: colors.text }]}>{item.label}</Text>
              </Pressable>
            </Link>
          ))}
        </View>

        <Link href="/(tabs)/library" asChild>
          <Pressable onPress={() => void hapticImpact("light")}>
            <Text style={[styles.link, { color: colors.primary }]}>Open library</Text>
          </Pressable>
        </Link>

        <AchievementsPanel userEmail={user?.email} stats={stats} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  greeting: { fontSize: 24, fontWeight: "700" },
  sub: { fontSize: 14, marginTop: 4, marginBottom: 16 },
  statsRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 8 },
  statCard: {
    flexGrow: 1,
    minWidth: "22%",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    alignItems: "center",
  },
  statValue: { fontSize: 20, fontWeight: "800" },
  statLabel: { fontSize: 11, marginTop: 4, fontWeight: "600" },
  quickLinks: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginVertical: 12 },
  quickChip: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 40,
    justifyContent: "center",
  },
  quickChipText: { fontSize: 13, fontWeight: "600" },
  link: { fontSize: 15, fontWeight: "600", marginVertical: 12 },
});
