import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { api } from "../api/client";
import { ALL_ACHIEVEMENTS, type AchievementStats } from "../lib/achievements";

type Earned = { achievement_type: string; metadata?: Record<string, unknown> };

type Props = {
  userEmail: string | undefined;
  stats: AchievementStats;
};

export function AchievementsPanel({ userEmail, stats }: Props) {
  const { data: earned = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["achievements", userEmail],
    queryFn: async () => {
      const { data } = await api.get<Earned[]>("/achievements/");
      return data;
    },
    enabled: !!userEmail,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const earnedIds = useMemo(() => new Set(earned.map((a) => a.achievement_type)), [earned]);

  const unlocked = ALL_ACHIEVEMENTS.filter((achievement) => earnedIds.has(achievement.id));
  const locked = ALL_ACHIEVEMENTS.filter((achievement) => !earnedIds.has(achievement.id));

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>Achievements</Text>
        <Text style={styles.count}>
          {unlocked.length} / {ALL_ACHIEVEMENTS.length}
        </Text>
      </View>
      {isLoading && userEmail ? (
        <Text style={styles.statusText}>Checking your achievements…</Text>
      ) : null}
      {isError ? (
        <View style={styles.errorRow}>
          <Text style={styles.errorText}>Achievements could not be loaded.</Text>
          <Pressable style={styles.retryButton} onPress={() => void refetch()}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : null}
      {unlocked.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.unlockedRow}>
          {unlocked.map((ach) => (
            <View key={ach.id} style={styles.unlocked}>
              <Text style={styles.icon}>{ach.icon}</Text>
              <Text style={styles.achTitle}>{ach.title}</Text>
              <Text style={styles.achDesc} numberOfLines={2}>
                {ach.description}
              </Text>
            </View>
          ))}
        </ScrollView>
      ) : null}
      {locked.length > 0 ? (
        <>
          <Text style={styles.lockedLabel}>Locked</Text>
          <View style={styles.lockedGrid}>
            {locked.map((ach) => (
              <View key={ach.id} style={styles.lockedTile}>
                <Text style={[styles.icon, styles.dim]}>{ach.icon}</Text>
                <Text style={[styles.achTitle, styles.dim]} numberOfLines={1}>
                  {ach.title}
                </Text>
                {ach.check(stats) ? (
                  <Text style={styles.progressComplete} numberOfLines={2}>
                    Goal reached · awaiting server confirmation
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 14,
  },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  title: { fontSize: 17, fontWeight: "700", color: "#0f172a" },
  count: { fontSize: 13, color: "#64748b", fontWeight: "600" },
  statusText: { color: "#64748b", fontSize: 13, marginBottom: 10 },
  errorRow: { marginBottom: 10, padding: 10, borderRadius: 10, backgroundColor: "#fef2f2" },
  errorText: { color: "#b91c1c", fontSize: 12, fontWeight: "600" },
  retryButton: { alignSelf: "flex-start", marginTop: 8, paddingVertical: 6, paddingHorizontal: 10 },
  retryText: { color: "#b91c1c", fontSize: 12, fontWeight: "800" },
  unlockedRow: { gap: 8, paddingVertical: 4 },
  unlocked: {
    width: 112,
    padding: 10,
    borderRadius: 12,
    backgroundColor: "#fffbeb",
    borderWidth: 1,
    borderColor: "#fde68a",
  },
  icon: { fontSize: 22, marginBottom: 4 },
  achTitle: { fontSize: 11, fontWeight: "700", color: "#0f172a" },
  achDesc: { fontSize: 9, color: "#64748b", marginTop: 2 },
  lockedLabel: { fontSize: 11, fontWeight: "700", color: "#94a3b8", marginTop: 8, marginBottom: 6 },
  lockedGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  lockedTile: {
    width: "30%",
    minWidth: 96,
    padding: 8,
    borderRadius: 10,
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    opacity: 0.75,
  },
  dim: { opacity: 0.55 },
  progressComplete: { marginTop: 4, color: "#92400e", fontSize: 9, lineHeight: 12 },
});
