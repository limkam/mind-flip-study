import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";

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

  const { data: myRank } = useQuery({
    queryKey: ["leaderboard", "me"],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await api.get<LeaderboardMeOut>("/leaderboard/me");
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
    queryKey: ["leaderboard", "page"],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const { data } = await api.get<Paginated<LeaderboardItemOut> | LeaderboardItemOut[]>(
        "/leaderboard",
        { params: { page: pageParam, size: PAGE_SIZE } },
      );
      return normalizePage(
        data,
        pageParam,
        PAGE_SIZE,
        (row) => Boolean(row?.user_id),
      );
    },
    getNextPageParam: (last) => (last.has_more ? last.page + 1 : undefined),
  });

  const items = flattenPages(data?.pages, (row) => Boolean(row.user_id));
  const total = data?.pages[0]?.total ?? 0;

  return (
    <Screen>
      {header}
      <PageHeader title="Leaderboard" subtitle="Top learners by total quiz XP" />
      {user && myRank ? (
        <View style={[styles.myRank, { backgroundColor: `${colors.primary}14`, borderColor: `${colors.primary}33` }]}>
          <Text style={[styles.myRankText, { color: colors.text }]}>
            Your standing:{" "}
            <Text style={{ fontWeight: "800" }}>
              {myRank.rank != null ? `#${myRank.rank}` : "Not ranked yet"}
            </Text>
            {" · "}
            <Text style={{ fontWeight: "800" }}>{myRank.xp ?? 0} XP</Text>
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
          keyExtractor={(item) => `${item.rank}-${item.user_id}`}
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
              message="Complete a quiz to appear on the board."
            />
          }
          renderItem={({ item }) => {
            const isMe = item.user_id === user?.id;
            const top = item.rank <= 3;
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
                    {(item.full_name || "?")
                      .split(" ")
                      .map((n) => n[0])
                      .join("")
                      .slice(0, 2)
                      .toUpperCase()}
                  </Text>
                </View>
                <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                  {item.full_name || "Anonymous"}
                  {isMe ? " (you)" : ""}
                </Text>
                <View style={styles.xpCol}>
                  <Text style={[styles.xp, { color: colors.text }]}>
                    {Number.isInteger(item.xp) ? item.xp : item.xp.toFixed(1)}
                  </Text>
                  <Text style={[styles.xpLabel, { color: colors.muted }]}>XP</Text>
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
  xpLabel: { fontSize: 11 },
});
