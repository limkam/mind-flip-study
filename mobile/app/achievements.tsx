import { useQuery } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { AchievementsPanel } from "../components/AchievementsPanel";
import { Screen } from "../components/Screen";
import { api } from "../api/client";
import { fetchFlashcardSetsList } from "../lib/flashcardSets";
import { useTheme } from "../hooks/useTheme";
import { useAuthStore } from "../store/authStore";
import type { AnalyticsSummaryOut } from "../types/api";
import type { AchievementStats } from "../lib/achievements";

export default function AchievementsScreen() {
  const { colors } = useTheme();
  const user = useAuthStore((s) => s.user);

  const { data: summary } = useQuery({
    queryKey: ["analytics-summary"],
    queryFn: async () => {
      const { data } = await api.get<AnalyticsSummaryOut>("/analytics/summary");
      return data;
    },
  });

  const { data: flashcardSets = [] } = useQuery({
    queryKey: ["flashcard-sets"],
    queryFn: fetchFlashcardSetsList,
  });

  const stats: AchievementStats = {
    quizCount: summary?.quiz_count ?? 0,
    hasPerfect: !!summary?.has_perfect_quiz,
    streak: summary?.streak_days ?? 0,
    totalCards: flashcardSets.reduce((n, s) => n + (s.card_count ?? 0), 0),
    challengesSent: 0,
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: "Achievements" }} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: colors.text }]}>Achievements</Text>
        <Text style={[styles.sub, { color: colors.muted }]}>Badges, XP, milestones, and rewards</Text>
        <AchievementsPanel stats={stats} userId={user?.id} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 32 },
  title: { fontSize: 28, fontWeight: "700", marginBottom: 4 },
  sub: { fontSize: 14, marginBottom: 16 },
});
