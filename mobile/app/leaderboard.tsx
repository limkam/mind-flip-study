import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";

import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "../components/PageHeader";
import { Screen } from "../components/Screen";
import { api } from "../api/client";
import { useScreenHeader } from "../hooks/useScreenHeader";
import { useTheme } from "../hooks/useTheme";
import { useAuthStore } from "../store/authStore";

type Scope = "global" | "connections";
type Period = "weekly" | "all_time";
type Metric = "xp" | "avg_score" | "most_quizzes" | "cards_mastered";

interface LeaderboardItem {
  rank: number;
  user_id: string;
  full_name: string;
  avatar_url?: string | null;
  value: number;
  xp: number;
  is_current_user: boolean;
}

interface LeaderboardMe {
  rank: number | null;
  value: number;
  metric: string;
  metric_label: string;
  xp: number;
  xp_to_next_rank: number;
  next_user_rank: number | null;
}

interface LeaderboardResponse {
  items: LeaderboardItem[];
  me: LeaderboardMe;
  around_me: LeaderboardItem[];
  total: number;
  page: number;
  size: number;
  has_more: boolean;
  total_pages: number;
  period: string;
  scope: string;
  metric: string;
  metric_label: string;
}

function rankEmoji(rank: number) {
  if (rank === 1) return "👑";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return `#${rank}`;
}

export default function LeaderboardScreen() {
  const { colors } = useTheme();
  const header = useScreenHeader("Leaderboard");
  const user = useAuthStore((s) => s.user);

  const [scope, setScope] = useState<Scope>("global");
  const [period, setPeriod] = useState<Period>("weekly");
  const [metric, setMetric] = useState<Metric>("xp");

  const { data, isLoading, isError, refetch, isRefetching } = useQuery<LeaderboardResponse>({
    queryKey: ["leaderboard-v2", scope, period, metric],
    enabled: !!user,
    queryFn: async () => {
      const res = await api.get<LeaderboardResponse>("/leaderboard", {
        params: { scope, period, metric, page: 1, size: 25 },
      });
      return res.data;
    },
  });

  const items = data?.items ?? [];
  const myStanding = data?.me;
  const aroundMe = data?.around_me ?? [];
  const total = data?.total ?? 0;
  const userInTop25 = items.some((i) => i.is_current_user);

  return (
    <Screen>
      {header}
      <PageHeader title="Leaderboard" subtitle="Earn XP and rise up global & study group rankings" />

      {/* Scope Controls */}
      <View style={styles.controlRow}>
        <Pressable
          onPress={() => setScope("global")}
          style={[
            styles.controlBtn,
            {
              backgroundColor: scope === "global" ? colors.primary : colors.surface,
              borderColor: colors.border,
            },
          ]}
        >
          <Text
            style={[
              styles.controlBtnText,
              { color: scope === "global" ? "#ffffff" : colors.text },
            ]}
          >
            🌐 Global
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setScope("connections")}
          style={[
            styles.controlBtn,
            {
              backgroundColor: scope === "connections" ? colors.primary : colors.surface,
              borderColor: colors.border,
            },
          ]}
        >
          <Text
            style={[
              styles.controlBtnText,
              { color: scope === "connections" ? "#ffffff" : colors.text },
            ]}
          >
            👥 Friends
          </Text>
        </Pressable>
      </View>

      {/* Period Controls */}
      <View style={styles.controlRow}>
        <Pressable
          onPress={() => setPeriod("weekly")}
          style={[
            styles.controlBtn,
            {
              backgroundColor: period === "weekly" ? `${colors.primary}22` : colors.surface,
              borderColor: period === "weekly" ? colors.primary : colors.border,
            },
          ]}
        >
          <Text
            style={[
              styles.controlBtnText,
              { color: period === "weekly" ? colors.primary : colors.muted },
            ]}
          >
            Weekly (Mon UTC)
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setPeriod("all_time")}
          style={[
            styles.controlBtn,
            {
              backgroundColor: period === "all_time" ? `${colors.primary}22` : colors.surface,
              borderColor: period === "all_time" ? colors.primary : colors.border,
            },
          ]}
        >
          <Text
            style={[
              styles.controlBtnText,
              { color: period === "all_time" ? colors.primary : colors.muted },
            ]}
          >
            All Time
          </Text>
        </Pressable>
      </View>

      {/* Your Standing Card */}
      {user && myStanding ? (
        <View
          style={[
            styles.myRankCard,
            { backgroundColor: `${colors.primary}12`, borderColor: `${colors.primary}33` },
          ]}
        >
          <View style={styles.myRankRow}>
            <View>
              <Text style={[styles.myRankLabel, { color: colors.muted }]}>
                Your Rank ({scope === "global" ? "Global" : "Friends"})
              </Text>
              <Text style={[styles.myRankVal, { color: colors.primary }]}>
                {myStanding.rank ? `#${myStanding.rank}` : "Unranked"}{" "}
                <Text style={{ fontSize: 16, color: colors.text, fontWeight: "600" }}>
                  ({Math.round(myStanding.value)} {myStanding.metric_label})
                </Text>
              </Text>
            </View>

            {myStanding.xp_to_next_rank > 0 && myStanding.next_user_rank ? (
              <View style={[styles.nextRankBadge, { backgroundColor: colors.surface, borderColor: `${colors.primary}44` }]}>
                <Text style={[styles.nextRankText, { color: colors.text }]}>
                  ⚡ +{Math.round(myStanding.xp_to_next_rank)} XP to reach #{myStanding.next_user_rank}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      ) : null}

      {isLoading ? (
        <Text style={[styles.centerText, { color: colors.muted }]}>Loading leaderboard…</Text>
      ) : isError ? (
        <EmptyState
          icon="⚠️"
          title="Could not load leaderboard"
          message="Please check network connectivity."
          actionLabel="Retry"
          onAction={() => refetch()}
        />
      ) : scope === "connections" && items.length === 0 ? (
        <EmptyState
          icon="👥"
          title="No Friends or Groups Yet"
          message="Your Friends & Groups leaderboard will appear once you join a study group or interact with other learners."
          actionLabel="View Global Board"
          onAction={() => setScope("global")}
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => `${item.rank}-${item.user_id}`}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={colors.primary} />
          }
          contentContainerStyle={styles.listContainer}
          ListHeaderComponent={
            <Text style={[styles.sectionHeader, { color: colors.muted }]}>
              {scope === "global" ? "Top 25 Global Learners" : "Rankings"} ({total} learners)
            </Text>
          }
          ListFooterComponent={
            !userInTop25 && aroundMe.length > 0 ? (
              <View style={styles.aroundSection}>
                <Text style={[styles.sectionHeader, { color: colors.muted }]}>
                  Around You (Your Nearby Position)
                </Text>
                {aroundMe.map((item) => {
                  const displayName =
                    item.full_name && item.full_name !== "Anonymous" ? item.full_name : "Learner";
                  return (
                    <View
                      key={`around-${item.rank}-${item.user_id}`}
                      style={[
                        styles.row,
                        {
                          backgroundColor: item.is_current_user ? `${colors.primary}20` : colors.surface,
                          borderColor: item.is_current_user ? colors.primary : colors.border,
                          borderWidth: item.is_current_user ? 2 : 1,
                        },
                      ]}
                    >
                      <Text style={[styles.rankText, { color: colors.text }]}>{rankEmoji(item.rank)}</Text>
                      <Text style={[styles.nameText, { color: colors.text }]} numberOfLines={1}>
                        {displayName}
                        {item.is_current_user ? " (you)" : ""}
                      </Text>
                      <Text style={[styles.xpText, { color: colors.primary }]}>
                        {Math.round(item.value)} XP
                      </Text>
                    </View>
                  );
                })}
              </View>
            ) : null
          }
          renderItem={({ item }) => {
            const isMe = item.is_current_user;
            const top = item.rank <= 3;
            const displayName =
              item.full_name && item.full_name !== "Anonymous" ? item.full_name : "Learner";
            return (
              <View
                style={[
                  styles.row,
                  {
                    backgroundColor: isMe
                      ? `${colors.primary}20`
                      : top
                      ? `${colors.primary}0D`
                      : colors.surface,
                    borderColor: isMe ? colors.primary : colors.border,
                    borderWidth: isMe ? 2 : 1,
                  },
                ]}
              >
                <Text style={[styles.rankText, { color: colors.text }]}>{rankEmoji(item.rank)}</Text>
                <View style={[styles.avatarBadge, { backgroundColor: `${colors.primary}22` }]}>
                  <Text style={[styles.avatarText, { color: colors.primary }]}>
                    {displayName
                      .split(" ")
                      .map((n) => n[0])
                      .join("")
                      .slice(0, 2)
                      .toUpperCase()}
                  </Text>
                </View>
                <Text style={[styles.nameText, { color: colors.text }]} numberOfLines={1}>
                  {displayName}
                  {isMe ? " (you)" : ""}
                </Text>
                <Text style={[styles.xpText, { color: colors.primary }]}>
                  {Math.round(item.value)} XP
                </Text>
              </View>
            );
          }}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  controlRow: {
    flexDirection: "row",
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  controlBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  controlBtnText: {
    fontSize: 13,
    fontWeight: "700",
  },
  myRankCard: {
    marginHorizontal: 16,
    marginVertical: 8,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  myRankRow: {
    flexDirection: "column",
    gap: 8,
  },
  myRankLabel: {
    fontSize: 11,
    textTransform: "uppercase",
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  myRankVal: {
    fontSize: 24,
    fontWeight: "800",
  },
  nextRankBadge: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  nextRankText: {
    fontSize: 12,
    fontWeight: "600",
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginVertical: 10,
  },
  aroundSection: {
    marginTop: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(150, 150, 150, 0.2)",
  },
  listContainer: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  centerText: {
    textAlign: "center",
    marginTop: 32,
    fontSize: 14,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  rankText: {
    width: 36,
    fontSize: 15,
    fontWeight: "700",
    textAlign: "center",
  },
  avatarBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 12,
    fontWeight: "800",
  },
  nameText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
  },
  xpText: {
    fontSize: 15,
    fontWeight: "800",
  },
});
