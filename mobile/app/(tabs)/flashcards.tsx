import { useQuery } from "@tanstack/react-query";
import { Link, useFocusEffect, useRouter } from "expo-router";
import { useCallback } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";

import { EmptyState } from "../../components/EmptyState";
import { PageHeader } from "../../components/PageHeader";
import { Screen } from "../../components/Screen";
import { StudySkeleton } from "../../components/skeletons/StudySkeleton";
import { fetchFlashcardSetsList } from "../../lib/flashcardSets";
import { getApiErrorMessage } from "../../lib/apiErrors";
import { useTheme } from "../../hooks/useTheme";
import { hapticImpact } from "../../lib/haptics";
import { useAuthStore } from "../../store/authStore";

export default function FlashcardsTab() {
  const { colors } = useTheme();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const { data: sets = [], isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ["flashcard-sets", "list"],
    queryFn: fetchFlashcardSetsList,
    staleTime: 0,
  });

  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );

  if (isLoading) {
    return (
      <Screen>
        <PageHeader title="My Flashcards" />
        <StudySkeleton />
      </Screen>
    );
  }

  if (isError) {
    return (
      <Screen>
        <PageHeader title="My Flashcards" subtitle={user?.email ? `Signed in as ${user.email}` : undefined} />
        <EmptyState
          icon="⚠️"
          title="Could not load flashcard sets"
          message={getApiErrorMessage(error, "Check your connection and API URL in mobile/.env.")}
          actionLabel="Retry"
          onAction={() => refetch()}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <PageHeader
        title="My Flashcards"
        subtitle={
          sets.length > 0
            ? `${sets.length} set${sets.length !== 1 ? "s" : ""} · ${user?.email ?? "your account"}`
            : `Generate sets on web or library · ${user?.email ?? "your account"}`
        }
      />
      <FlatList
        data={sets}
        keyExtractor={(s) => s.id}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={colors.primary} />
        }
        contentContainerStyle={sets.length === 0 ? styles.emptyList : styles.list}
        ListEmptyComponent={
          <EmptyState
            icon="📚"
            title="No flashcard sets yet"
            message="Sets you create on web or mobile share the same account. Pull down to refresh, or generate cards from a book in Library."
            actionLabel="Open library"
            onAction={() => router.push("/(tabs)/library")}
          />
        }
        renderItem={({ item }) => (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Link href={`/study/${item.id}`} asChild>
              <Pressable onPress={() => void hapticImpact("light")}>
                <Text style={[styles.cardTitle, { color: colors.text }]}>{item.title}</Text>
                <Text style={[styles.cardMeta, { color: colors.muted }]}>
                  {item.card_count} cards
                  {item.book_title ? ` · ${item.book_title}` : ""}
                </Text>
              </Pressable>
            </Link>
            {item.card_count >= 4 ? (
              <Link href={`/games/${item.id}`} asChild>
                <Pressable
                  style={[styles.gameBtn, { borderColor: colors.primary }]}
                  onPress={() => void hapticImpact("light")}
                >
                  <Text style={[styles.gameBtnText, { color: colors.primary }]}>Play games →</Text>
                </Pressable>
              </Link>
            ) : null}
          </View>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: 16, paddingBottom: 32, gap: 10 },
  emptyList: { flexGrow: 1 },
  card: {
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    marginBottom: 10,
  },
  cardTitle: { fontSize: 16, fontWeight: "600" },
  cardMeta: { fontSize: 13, marginTop: 4 },
  gameBtn: {
    marginTop: 10,
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
  },
  gameBtnText: { fontWeight: "700", fontSize: 14 },
});
