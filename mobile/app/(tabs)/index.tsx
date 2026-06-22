import { useQuery } from "@tanstack/react-query";
import { Link } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Screen } from "../../components/Screen";
import { WeakTopicsChips } from "../../components/WeakTopicsChips";
import { DashboardSkeleton } from "../../components/skeletons/DashboardSkeleton";
import { api } from "../../api/client";
import { fetchFlashcardSetsList } from "../../lib/flashcardSets";
import { useTheme } from "../../hooks/useTheme";
import { hapticImpact } from "../../lib/haptics";
import { useAuthStore } from "../../store/authStore";
import type { AnalyticsSummaryOut } from "../../types/api";

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
        <Link href="/profile" asChild>
          <Pressable>
            <Text style={[styles.greeting, { color: colors.text }]}>
              Hi, {user?.full_name?.split(" ")[0] ?? "Learner"}
            </Text>
          </Pressable>
        </Link>
        <Text style={[styles.sub, { color: colors.muted }]}>Your progress at a glance</Text>

        {flashcardSets.slice(0, 2).map((set) => (
          <Link key={set.id} href={`/study/${set.id}`} asChild>
            <Pressable style={[styles.recentCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.recentTitle, { color: colors.text }]} numberOfLines={1}>{set.title}</Text>
              {set.selected_chapters?.[0] && (
                <Text style={[styles.recentChapter, { color: colors.primary }]} numberOfLines={1}>
                  Chapter: {set.selected_chapters[0]}
                </Text>
              )}
              <Text style={[styles.recentMeta, { color: colors.muted }]}>{set.card_count} cards</Text>
            </Pressable>
          </Link>
        ))}

        <Link href="/achievements" asChild>
          <Pressable onPress={() => void hapticImpact("light")}>
            <Text style={[styles.link, { color: colors.primary }]}>View achievements</Text>
          </Pressable>
        </Link>

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
  recentCard: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8 },
  recentTitle: { fontSize: 15, fontWeight: "600" },
  recentChapter: { fontSize: 12, marginTop: 2 },
  recentMeta: { fontSize: 11, marginTop: 4 },
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
