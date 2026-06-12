import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";

import { EmptyState } from "../../components/EmptyState";
import { PageHeader } from "../../components/PageHeader";
import { Screen } from "../../components/Screen";
import { StudySkeleton } from "../../components/skeletons/StudySkeleton";
import { deleteFlashcardSet, fetchFlashcardSetsList } from "../../lib/flashcardSets";
import { getApiErrorMessage } from "../../lib/apiErrors";
import { useTheme } from "../../hooks/useTheme";
import { hapticImpact } from "../../lib/haptics";
import { useAuthStore } from "../../store/authStore";

export default function FlashcardsTab() {
  const { colors } = useTheme();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const [deletingId, setDeletingId] = useState<string | null>(null);

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

  const confirmDelete = (setId: string, title: string, cardCount: number) => {
    Alert.alert(
      "Delete flashcard set?",
      `This permanently deletes "${title}" and all ${cardCount} flashcards.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void (async () => {
              setDeletingId(setId);
              try {
                await deleteFlashcardSet(setId);
                await queryClient.invalidateQueries({ queryKey: ["flashcard-sets"] });
              } catch (e) {
                Alert.alert("Could not delete set", getApiErrorMessage(e, "Please try again."));
              } finally {
                setDeletingId(null);
              }
            })();
          },
        },
      ],
    );
  };

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
            <View style={styles.cardRow}>
              <Link href={`/study/${item.id}`} asChild>
                <Pressable style={styles.cardBody} onPress={() => void hapticImpact("light")}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>{item.title}</Text>
                  <Text style={[styles.cardMeta, { color: colors.muted }]}>
                    {item.card_count} cards
                    {item.book_title ? ` · ${item.book_title}` : ""}
                  </Text>
                </Pressable>
              </Link>
              <Pressable
                style={styles.deleteBtn}
                disabled={deletingId === item.id}
                onPress={() => {
                  void hapticImpact("light");
                  confirmDelete(item.id, item.title, item.card_count);
                }}
                accessibilityLabel={`Delete ${item.title}`}
              >
                <Text style={[styles.deleteBtnText, { color: colors.destructive ?? "#ef4444" }]}>
                  {deletingId === item.id ? "…" : "Delete"}
                </Text>
              </Pressable>
            </View>
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
  cardRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  cardBody: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: "600" },
  cardMeta: { fontSize: 13, marginTop: 4 },
  deleteBtn: { minHeight: 44, justifyContent: "center", paddingHorizontal: 4 },
  deleteBtnText: { fontSize: 13, fontWeight: "600" },
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
