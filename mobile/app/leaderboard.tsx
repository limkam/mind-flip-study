import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";

import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "../components/PageHeader";
import { Screen } from "../components/Screen";
import { api } from "../api/client";
import { useScreenHeader } from "../hooks/useScreenHeader";
import { useTheme } from "../hooks/useTheme";
import { useAuthStore } from "../store/authStore";
import { flattenPages, normalizePage } from "../lib/pagination";
import type { LeaderboardItemOut, LeaderboardMeOut, Paginated } from "../types/api";

const PAGE_SIZE = 50;

const TABS = [
  { id: "avg_score" as const, label: "Avg Score", format: (v: number) => `${v}%` },
  { id: "most_quizzes" as const, label: "Most Quizzes", format: (v: number) => String(Math.round(v)) },
  { id: "cards_mastered" as const, label: "Cards Mastered", format: (v: number) => String(Math.round(v)) },
];

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
  const [metric, setMetric] = useState<(typeof TABS)[number]["id"]>("avg_score");
  const activeTab = TABS.find((t) => t.id === metric) ?? TABS[0];

  const { data: myRank } = useQuery({
    queryKey: ["leaderboard", "me", metric],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await api.get<LeaderboardMeOut>("/leaderboard/me", { params: { metric } });
      return data;
    },
  });

  const {
    data,
    isLoading,
    isError,
    refetch,
    isRefetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["leaderboard", "page", metric],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const { data } = await api.get<Paginated<LeaderboardItemOut> | LeaderboardItemOut[]>(
        "/leaderboard",
        { params: { page: pageParam, size: PAGE_SIZE, metric } },
      );
      return normalizePage(data, pageParam, PAGE_SIZE, (row) => Boolean(row?.user_id));
    },
    getNextPageParam: (last) => (last.has_more ? last.page + 1 : undefined),
  });

  const items = flattenPages(data?.pages, (row) => Boolean(row.user_id));
  const total = data?.pages[0]?.total ?? 0;

  return (
    <Screen>
      {header}
      <PageHeader title="Leaderboard" subtitle="See how you rank against other learners" />

      <View style={styles.tabs}>
        {TABS.map((tab) => (
          <Pressable
            key={tab.id}
            onPress={() => setMetric(tab.id)}
            style={[
              styles.tab,
              {
                backgroundColor: metric === tab.id ? colors.surface : "transparent",
                borderColor: colors.border,
              },
            ]}
          >
            <Text
              style={[
                styles.tabText,
                { color: metric === tab.id ? colors.text : colors.muted, fontWeight: metric === tab.id ? "700" : "500" },
              ]}
              numberOfLines={1}
            >
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {user && myRank ? (
        <View style={[styles.myRank, { backgroundColor: `${colors.primary}14`, borderColor: `${colors.primary}33` }]}>
          <Text style={[styles.myRankText, { color: colors.text }]}>
            Your standing ({activeTab.label}):{" "}
            <Text style={{ fontWeight: "800" }}>
              {myRank.rank != null ? `#${myRank.rank}` : "Not ranked yet"}
            </Text>
            {" · "}
            <Text style={{ fontWeight: "800" }}>{activeTab.format(myRank.value ?? 0)}</Text>
          </Text>
        </View>
      ) : null}

      {isLoading ? (
        <Text style={[styles.center, { color: colors.muted }]}>Loading…</Text>
      ) : isError ? (
        <EmptyState
          icon="⚠️"
          title="Could not load leaderboard"
          message="Check your connection and try again."
          actionLabel="Retry"
          onAction={() => refetch()}
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => `${item.rank}-${item.user_id}-${metric}`}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={colors.primary} />
          }
          onEndReached={() => {
            if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
          }}
          onEndReachedThreshold={0.4}
          contentContainerStyle={items.length === 0 ? styles.emptyList : styles.list}
          ListHeaderComponent={
            total > 0 ? (
              <Text style={[styles.count, { color: colors.muted }]}>{total} learners</Text>
            ) : null
          }
          ListEmptyComponent={
            <EmptyState
              icon="🏆"
              title="No leaderboard data yet"
              message="Complete a quiz or master cards to appear on the board."
            />
          }
          renderItem={({ item }) => {
            const isMe = item.user_id === user?.id;
            const top = item.rank <= 3;
            const displayName = item.full_name && item.full_name !== "Anonymous" ? item.full_name : "Learner";
            const value = item.value ?? item.xp ?? 0;
            return (
              <View
                style={[
                  styles.row,
                  {
                    backgroundColor: top ? `${colors.primary}10` : colors.surface,
                    borderColor: isMe ? colors.primary : colors.border,
                    borderWidth: isMe ? 2 : 1,
                  },
                ]}
              >
                <Text style={[styles.rank, { color: colors.text }]}>{rankEmoji(item.rank)}</Text>
                <View style={[styles.avatar, { backgroundColor: `${colors.primary}22` }]}>
                  <Text style={[styles.avatarText, { color: colors.primary }]}>
                    {displayName
                      .split(" ")
                      .map((n) => n[0])
                      .join("")
                      .slice(0, 2)
                      .toUpperCase()}
                  </Text>
                </View>
                <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                  {displayName}
                  {isMe ? " (you)" : ""}
                </Text>
                <View style={styles.xpCol}>
                  <Text style={[styles.xp, { color: colors.text }]}>{activeTab.format(value)}</Text>
                </View>
              </View>
            );
          }}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: 16, paddingBottom: 32 },
  emptyList: { flexGrow: 1 },
  center: { textAlign: "center", marginTop: 32 },
  tabs: {
    flexDirection: "row",
    gap: 6,
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 4,
    borderRadius: 12,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
  },
  tabText: { fontSize: 11 },
  myRank: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  myRankText: { fontSize: 14, textAlign: "center" },
  count: { fontSize: 13, marginBottom: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  rank: { width: 36, fontSize: 16, fontWeight: "700", textAlign: "center" },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 13, fontWeight: "800" },
  name: { flex: 1, fontSize: 15, fontWeight: "600" },
  xpCol: { alignItems: "flex-end" },
  xp: { fontSize: 16, fontWeight: "800" },
});
