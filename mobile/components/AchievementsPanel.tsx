import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { api } from "../api/client";
import { useTheme } from "../hooks/useTheme";
import { ALL_ACHIEVEMENTS, type AchievementStats } from "../lib/achievements";

type Earned = { achievement_type: string; metadata?: Record<string, unknown> };

type Props = {
  userEmail: string | undefined;
  stats: AchievementStats;
};

export function AchievementsPanel({ userEmail, stats }: Props) {
  const { colors } = useTheme();
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
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Achievements</Text>
        <Text style={[styles.count, { color: colors.muted }]}>
          {unlocked.length} / {ALL_ACHIEVEMENTS.length}
        </Text>
      </View>
      {isLoading && userEmail ? (
        <Text style={[styles.statusText, { color: colors.muted }]}>Checking your achievements…</Text>
      ) : null}
      {isError ? (
        <View style={[styles.errorRow, { backgroundColor: `${colors.danger}15` }]}>
          <Text style={[styles.errorText, { color: colors.danger }]}>Achievements could not be loaded.</Text>
          <Pressable style={styles.retryButton} onPress={() => void refetch()}>
            <Text style={[styles.retryText, { color: colors.danger }]}>Try again</Text>
          </Pressable>
        </View>
      ) : null}
      {unlocked.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.unlockedRow}>
          {unlocked.map((ach) => (
            <View key={ach.id} style={[styles.unlocked, { backgroundColor: `${colors.xp}12`, borderColor: `${colors.xp}45` }]}>
              <Text style={styles.icon}>{ach.icon}</Text>
              <Text style={[styles.achTitle, { color: colors.text }]}>{ach.title}</Text>
              <Text style={[styles.achDesc, { color: colors.muted }]} numberOfLines={3}>
                {ach.description}
              </Text>
            </View>
          ))}
        </ScrollView>
      ) : null}
      {locked.length > 0 ? (
        <>
          <Text style={[styles.lockedLabel, { color: colors.muted }]}>Locked</Text>
          <View style={styles.lockedGrid}>
            {locked.map((ach) => (
              <View key={ach.id} style={[styles.lockedTile, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
                <Text style={[styles.icon, styles.dim]}>{ach.icon}</Text>
                <Text style={[styles.achTitle, styles.dim, { color: colors.text }]} numberOfLines={2}>
                  {ach.title}
                </Text>
                {ach.check(stats) ? (
                  <Text style={[styles.progressComplete, { color: colors.warning }]} numberOfLines={3}>
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
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
  },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  title: { fontSize: 17, fontWeight: "700" },
  count: { fontSize: 13, fontWeight: "600" },
  statusText: { fontSize: 13, marginBottom: 10 },
  errorRow: { marginBottom: 10, padding: 10, borderRadius: 10 },
  errorText: { fontSize: 12, fontWeight: "600" },
  retryButton: { alignSelf: "flex-start", marginTop: 8, paddingVertical: 6, paddingHorizontal: 10 },
  retryText: { fontSize: 12, fontWeight: "800" },
  unlockedRow: { gap: 8, paddingVertical: 4 },
  unlocked: {
    width: 112,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  icon: { fontSize: 22, marginBottom: 4 },
  achTitle: { fontSize: 11, fontWeight: "700" },
  achDesc: { fontSize: 9, marginTop: 2 },
  lockedLabel: { fontSize: 11, fontWeight: "700", marginTop: 8, marginBottom: 6 },
  lockedGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  lockedTile: {
    width: "30%",
    minWidth: 96,
    padding: 8,
    borderRadius: 10,
    borderWidth: 1,
    opacity: 0.75,
  },
  dim: { opacity: 0.55 },
  progressComplete: { marginTop: 4, fontSize: 9, lineHeight: 12 },
});
