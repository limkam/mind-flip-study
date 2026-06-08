import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { api } from "../api/client";
import { ALL_ACHIEVEMENTS, type AchievementStats } from "../lib/achievements";

type Earned = { achievement_type: string; metadata?: Record<string, unknown> };

type Props = {
  userEmail: string | undefined;
  stats: AchievementStats;
};

export function AchievementsPanel({ userEmail, stats }: Props) {
  const queryClient = useQueryClient();

  const { data: earned = [], isFetched } = useQuery({
    queryKey: ["achievements", userEmail],
    queryFn: async () => {
      const { data } = await api.get<Earned[]>("/achievements/");
      return data;
    },
    enabled: !!userEmail,
  });

  const earnedIds = useMemo(() => new Set(earned.map((a) => a.achievement_type)), [earned]);
  const earnedKey = useMemo(() => [...earnedIds].sort().join(","), [earnedIds]);
  const statsKey = JSON.stringify(stats);

  useEffect(() => {
    if (!isFetched || !userEmail) return;
    const missing = ALL_ACHIEVEMENTS.filter((a) => !earnedIds.has(a.id) && a.check(stats));
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      for (const ach of missing) {
        if (cancelled) return;
        try {
          await api.post("/achievements/", {
            achievement_type: ach.id,
            metadata: { title: ach.title, description: ach.description, icon: ach.icon },
          });
        } catch {
          /* ignore duplicate / race */
        }
      }
      if (!cancelled) {
        await queryClient.invalidateQueries({ queryKey: ["achievements", userEmail] });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isFetched, userEmail, earnedKey, statsKey, earnedIds, queryClient]);

  const unlocked = ALL_ACHIEVEMENTS.filter((a) => earnedIds.has(a.id));
  const locked = ALL_ACHIEVEMENTS.filter((a) => !earnedIds.has(a.id));

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>Achievements</Text>
        <Text style={styles.count}>
          {unlocked.length} / {ALL_ACHIEVEMENTS.length}
        </Text>
      </View>
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
});
