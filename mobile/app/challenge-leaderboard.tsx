import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "../components/PageHeader";
import { Screen } from "../components/Screen";
import { api } from "../api/client";
import { useScreenHeader } from "../hooks/useScreenHeader";
import { useTheme } from "../hooks/useTheme";
import { useAuthStore } from "../store/authStore";

type OverallRow = {
  rank: number;
  user_id: string;
  full_name: string;
  points: number;
  accuracy: number;
  activity: number;
  wins: number;
};

type Badge = {
  id: string;
  title: string;
  description: string;
  icon: string;
  category: string;
};

const TABS = [
  { id: "overall", label: "Overall" },
  { id: "by_content", label: "By Content" },
  { id: "badges", label: "Badges" },
] as const;

export default function ChallengeLeaderboardScreen() {
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

  const badgesQuery = useQuery({
    queryKey: ["challenge-leaderboard", "badges"],
    enabled: tab === "badges",
    queryFn: async () => {
      const { data } = await api.get<Badge[]>("/challenge-leaderboard/badges");
      return data ?? [];
    },
  });

  const loading = tab === "overall" ? overallQuery.isLoading : tab === "by_content" ? contentQuery.isLoading : badgesQuery.isLoading;

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
          ListEmptyComponent={<EmptyState icon="📚" title="No content rankings" />}
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
          data={badgesQuery.data ?? []}
          keyExtractor={(b) => b.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<EmptyState icon="🎖️" title="No badges yet" message="Win challenges to earn badges." />}
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
