import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";

import { EmptyState } from "../../components/EmptyState";
import { PageHeader } from "../../components/PageHeader";
import { Screen } from "../../components/Screen";
import { StudySkeleton } from "../../components/skeletons/StudySkeleton";
import { TagEditModal } from "../../components/library/TagEditModal";
import { deleteFlashcardSet, fetchFlashcardSetsList, updateFlashcardSetTags } from "../../lib/flashcardSets";
import { getApiErrorMessage } from "../../lib/apiErrors";
import { useTheme } from "../../hooks/useTheme";
import { hapticImpact } from "../../lib/haptics";
import { useAuthStore } from "../../store/authStore";
import type { FlashcardSetOut } from "../../types/api";
import { normalizeTagsList } from "../../lib/tagUtils";

export default function FlashcardsTab() {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const bootstrapStatus = useAuthStore((s) => s.bootstrapStatus);
  const queryClient = useQueryClient();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Tag editing state
  const [editingSet, setEditingSet] = useState<FlashcardSetOut | null>(null);
  const [savingTags, setSavingTags] = useState(false);
  const saveInFlightRef = useRef(false);

  const isMountedRef = useRef(true);
  const editingSetRef = useRef<FlashcardSetOut | null>(null);
  const saveAttemptIdRef = useRef(0);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const { data: sets = [], isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ["flashcard-sets"],
    queryFn: fetchFlashcardSetsList,
  });

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

  const handleOpenTagEditor = (set: FlashcardSetOut) => {
    void hapticImpact("light");
    editingSetRef.current = set;
    setEditingSet(set);
  };

  const handleSaveTags = async (newTags: string[]) => {
    if (!editingSetRef.current || saveInFlightRef.current) return;

    const currentUserId = user?.id;
    const targetSetId = editingSetRef.current.id;
    saveAttemptIdRef.current += 1;
    const currentAttemptId = saveAttemptIdRef.current;

    if (!currentUserId || bootstrapStatus !== "authenticated") {
      Alert.alert("Authentication Error", "Your session has expired. Please sign in again.");
      editingSetRef.current = null;
      setEditingSet(null);
      return;
    }

    saveInFlightRef.current = true;
    setSavingTags(true);

    try {
      const updatedSet = await updateFlashcardSetTags(targetSetId, newTags);

      if (!isMountedRef.current || currentAttemptId !== saveAttemptIdRef.current) {
        return;
      }

      // Element-level runtime response validation
      const validTags =
        Array.isArray(updatedSet?.tags) &&
        updatedSet.tags.every((t) => typeof t === "string");

      if (!updatedSet || typeof updatedSet !== "object" || updatedSet.id !== targetSetId || !validTags) {
        Alert.alert("Contract Error", "Received an invalid response from server. Tags were not updated.");
        return;
      }

      // Identity and target set validation post-response
      const latestUser = useAuthStore.getState().user;
      const latestAuth = useAuthStore.getState().bootstrapStatus;

      if (
        !latestUser ||
        latestUser.id !== currentUserId ||
        latestAuth !== "authenticated" ||
        editingSetRef.current?.id !== targetSetId
      ) {
        // Identity or active editing set changed during request
        editingSetRef.current = null;
        setEditingSet(null);
        return;
      }

      // Direct cache update for exact match
      queryClient.setQueryData<FlashcardSetOut[]>(["flashcard-sets"], (old) => {
        if (!old) return old;
        return old.map((s) => (s.id === targetSetId ? { ...s, tags: updatedSet.tags } : s));
      });

      // Precise query invalidations
      void queryClient.invalidateQueries({ queryKey: ["flashcard-sets"] });
      void queryClient.invalidateQueries({ queryKey: ["study-session", targetSetId] });

      editingSetRef.current = null;
      setEditingSet(null);
    } catch (e: unknown) {
      if (!isMountedRef.current || currentAttemptId !== saveAttemptIdRef.current) {
        return;
      }
      const status = (e as { response?: { status?: number } })?.response?.status;
      if (status === 401) {
        editingSetRef.current = null;
        setEditingSet(null);
        return; // Handled centrally by API client
      }
      if (status === 404) {
        Alert.alert("Set Unavailable", "This flashcard set is no longer available.");
        editingSetRef.current = null;
        setEditingSet(null);
        void queryClient.invalidateQueries({ queryKey: ["flashcard-sets"] });
      } else {
        Alert.alert("Could Not Save Tags", getApiErrorMessage(e, "Please try again."));
      }
    } finally {
      if (currentAttemptId === saveAttemptIdRef.current) {
        saveInFlightRef.current = false;
        if (isMountedRef.current) {
          setSavingTags(false);
        }
      }
    }
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
        renderItem={({ item }) => {
          const itemTags = normalizeTagsList(item.tags || []);
          return (
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
                  <Text style={[styles.deleteBtnText, { color: colors.danger }]}>
                    {deletingId === item.id ? "…" : "Delete"}
                  </Text>
                </Pressable>
              </View>

              {/* Tag Row & Tag Edit Button */}
              <View style={styles.tagRow}>
                {itemTags.map((tag) => (
                  <View
                    key={tag}
                    style={[
                      styles.tagChip,
                      {
                        backgroundColor: isDark ? "#1e293b" : "#f1f5f9",
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <Text style={[styles.tagChipText, { color: colors.muted }]}>#{tag}</Text>
                  </View>
                ))}
                <Pressable
                  style={styles.editTagsBtn}
                  onPress={() => handleOpenTagEditor(item)}
                  accessibilityLabel={`Edit tags for ${item.title}`}
                >
                  <Text style={[styles.editTagsBtnText, { color: colors.primary }]}>
                    {itemTags.length > 0 ? "Edit tags" : "+ Add tags"}
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
          );
        }}
      />

      {editingSet ? (
        <TagEditModal
          visible={!!editingSet}
          setId={editingSet.id}
          setTitle={editingSet.title}
          initialTags={editingSet.tags || []}
          saving={savingTags}
          onSave={handleSaveTags}
          onClose={() => {
            if (!savingTags) setEditingSet(null);
          }}
        />
      ) : null}
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
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
  },
  tagChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
  },
  tagChipText: {
    fontSize: 12,
    fontWeight: "500",
  },
  editTagsBtn: {
    minHeight: 30,
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  editTagsBtnText: {
    fontSize: 12,
    fontWeight: "600",
  },
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
