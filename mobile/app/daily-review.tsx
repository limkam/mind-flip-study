import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { Link } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import { api } from "../api/client";
import { FlashCard } from "../components/FlashCard";
import { Screen } from "../components/Screen";
import { StudySessionSummary } from "../components/study/StudySessionSummary";
import { RecallRatingBar } from "../components/study/RecallRatingBar";
import { StudyProgressHeader } from "../components/study/StudyProgressHeader";
import { useScreenHeader } from "../hooks/useScreenHeader";
import { useTheme } from "../hooks/useTheme";
import { hapticImpact, hapticSuccess } from "../lib/haptics";
import { queueProgressSync } from "../lib/offlineStudy";
import { invalidateAfterStudyProgress } from "../lib/studyInvalidation";
import { submitStudyProgress } from "../lib/studyProgress";
import { useCelebration } from "../context/CelebrationContext";
import { useAuthStore } from "../store/authStore";
import type { BookOut, DueFlashcardOut, Paginated, StudyProgressOut } from "../types/api";

type ReviewItem = {
  card: { id: string; front: string; back: string; chapter?: string | null };
  setId: string;
  setTitle: string;
  bookTitle?: string | null;
  bookId?: string | null;
};

/** Runtime parser and deduplicator for due flashcard rows. Preserves server SM-2 ordering. */
function parseDueCards(raw: unknown): DueFlashcardOut[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const valid: DueFlashcardOut[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    if (typeof obj.id !== "string" || typeof obj.set_id !== "string") continue;
    if (typeof obj.front !== "string" || typeof obj.back !== "string") continue;
    if (seen.has(obj.id)) continue;
    seen.add(obj.id);
    valid.push(item as DueFlashcardOut);
  }
  return valid;
}

function mapReviewRows(rows: DueFlashcardOut[]): ReviewItem[] {
  return rows.map((row) => ({
    card: { id: row.id, front: row.front, back: row.back, chapter: row.chapter },
    setId: row.set_id,
    setTitle: row.set_title,
    bookTitle: row.book_title,
    bookId: row.book_id ? String(row.book_id) : null,
  }));
}

export default function DailyReviewScreen() {
  const { colors } = useTheme();
  const header = useScreenHeader("Daily Review");
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const { requestMany: requestCelebrations } = useCelebration();

  const [currentIdx, setCurrentIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [sessionDone, setSessionDone] = useState(false);
  const [pendingRating, setPendingRating] = useState<number | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedBooks, setSelectedBooks] = useState<Record<string, boolean>>({});
  const [selectedChapters, setSelectedChapters] = useState<Record<string, boolean>>({});
  const [hardReviewMode, setHardReviewMode] = useState(false);
  const [hardReviewItems, setHardReviewItems] = useState<ReviewItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const [sessionStats, setSessionStats] = useState({
    hard: 0,
    medium: 0,
    easy: 0,
    total: 0,
    submittedCount: 0,
    queuedOfflineCount: 0,
    rejectedCount: 0,
    ratingCounts: {} as Partial<Record<1 | 2 | 3 | 4 | 5, number>>,
  });

  const ratingInFlightRef = useRef(new Set<string>());
  const serverProgress = useRef<Record<string, StudyProgressOut>>({});
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const {
    data: books = [],
    isPending: booksLoading,
    isError: booksError,
    refetch: refetchBooks,
  } = useQuery({
    queryKey: ["books-daily-review"],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await api.get<Paginated<BookOut>>("/books/", { params: { page: 1, size: 100 } });
      const items = Array.isArray(data?.items) ? data.items : [];
      return items.filter((b) => b && typeof b.id === "string" && typeof b.title === "string");
    },
  });

  const activeBookIds = useMemo(
    () =>
      Object.entries(selectedBooks)
        .filter(([, v]) => v)
        .map(([id]) => id),
    [selectedBooks],
  );

  const booksInitialized = books.length > 0 && Object.keys(selectedBooks).length > 0;

  const {
    data: reviewItems = [],
    isPending: queuePending,
    isFetching: queueFetching,
    isError: queueError,
    refetch: refetchQueue,
  } = useQuery({
    queryKey: ["daily-review-queue", user?.id, activeBookIds],
    enabled: !!user && booksInitialized && activeBookIds.length > 0 && !hardReviewMode,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const params: Record<string, string | number | string[]> = { limit: 100 };
      if (activeBookIds.length === 1) params.book_id = activeBookIds[0];
      else if (activeBookIds.length > 1) params.book_ids = activeBookIds;

      const { data } = await api.get<unknown>("/study/daily-review", {
        params,
        paramsSerializer: { indexes: null },
      });

      const validated = parseDueCards(data);
      const idSet = new Set(activeBookIds.map(String));
      const filtered = validated.filter((r) => r.book_id && idSet.has(String(r.book_id)));
      return mapReviewRows(filtered);
    },
  });

  const availableChapters = useMemo(
    () => [...new Set(reviewItems.map((i) => i.card.chapter).filter(Boolean))].sort() as string[],
    [reviewItems],
  );

  const activeChapterNames = useMemo(() => {
    if (availableChapters.length === 0) return null;
    const names = Object.entries(selectedChapters)
      .filter(([, v]) => v)
      .map(([name]) => name);
    if (names.length === 0) return [];
    if (names.length === availableChapters.length) return null;
    return names;
  }, [selectedChapters, availableChapters]);

  const scopedReviewItems = useMemo(() => {
    if (activeChapterNames === null) return reviewItems;
    if (activeChapterNames.length === 0) return [];
    const allowed = new Set(activeChapterNames);
    return reviewItems.filter((i) => i.card.chapter && allowed.has(i.card.chapter));
  }, [reviewItems, activeChapterNames]);

  const displayItems = hardReviewMode ? hardReviewItems : scopedReviewItems;
  const count = displayItems.length;
  const item = displayItems[currentIdx];

  useEffect(() => {
    if (!books.length) return;
    setSelectedBooks((prev) => {
      if (Object.keys(prev).length > 0) return prev;
      const init: Record<string, boolean> = {};
      books.forEach((b) => {
        init[b.id] = true;
      });
      return init;
    });
  }, [books]);

  useEffect(() => {
    if (!availableChapters.length) {
      setSelectedChapters((prev) => (Object.keys(prev).length === 0 ? prev : {}));
      return;
    }
    setSelectedChapters((prev) => {
      if (Object.keys(prev).length > 0) return prev;
      const init: Record<string, boolean> = {};
      availableChapters.forEach((ch) => {
        init[ch] = true;
      });
      return init;
    });
  }, [availableChapters]);

  const activeBookKey = activeBookIds.join("|");
  const activeChapterKey = activeChapterNames?.join("|") ?? "";

  useEffect(() => {
    setCurrentIdx(0);
    setFlipped(false);
    setPendingRating(null);
    setSelectedChapters((prev) => (Object.keys(prev).length === 0 ? prev : {}));
  }, [activeBookKey]);

  useEffect(() => {
    setCurrentIdx(0);
    setFlipped(false);
    setPendingRating(null);
  }, [activeChapterKey]);

  useEffect(() => {
    setPendingRating(null);
  }, [currentIdx]);

  useEffect(() => {
    if (currentIdx >= count && count > 0) {
      setCurrentIdx(count - 1);
    }
  }, [count, currentIdx]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.allSettled([refetchBooks(), refetchQueue()]);
    } finally {
      if (isMountedRef.current) {
        setRefreshing(false);
      }
    }
  }, [refetchBooks, refetchQueue]);

  const rate = useCallback(
    async (quality: number) => {
      const currentCardId = item?.card.id;
      const expectedUserId = user?.id;
      if (!item || !currentCardId || !expectedUserId) return;

      if (ratingInFlightRef.current.has(currentCardId)) return;
      ratingInFlightRef.current.add(currentCardId);

      setPendingRating(quality);
      const bucket = quality <= 2 ? "hard" : quality >= 5 ? "easy" : "medium";

      try {
        const result = await submitStudyProgress(
          { card_id: currentCardId, quality },
          queueProgressSync,
        );

        if (!isMountedRef.current || useAuthStore.getState().user?.id !== expectedUserId) {
          return;
        }

        if (result.status === "submitted" || result.status === "queued") {
          const ratingKey = quality as 1 | 2 | 3 | 4 | 5;
          setSessionStats((s) => ({
            ...s,
            total: s.total + 1,
            [bucket]: s[bucket] + 1,
            ratingCounts: {
              ...s.ratingCounts,
              [ratingKey]: (s.ratingCounts[ratingKey] ?? 0) + 1,
            },
          }));
          if (result.status === "submitted") {
            serverProgress.current[result.progress.card_id] = result.progress;
            setSessionStats((s) => ({ ...s, submittedCount: s.submittedCount + 1 }));
            void requestCelebrations(result.progress);
            await invalidateAfterStudyProgress(queryClient, {
              expectedUserId,
              setIds: [item.setId],
              cardIds: [result.progress.card_id],
            });
          } else {
            setSessionStats((s) => ({ ...s, queuedOfflineCount: s.queuedOfflineCount + 1 }));
          }

          if (quality <= 2 && !hardReviewMode) {
            setHardReviewItems((items) =>
              items.some((i) => i.card.id === currentCardId) ? items : [...items, item],
            );
          }

          void hapticImpact("light");

          if (currentIdx >= count - 1) {
            setSessionDone(true);
            void hapticSuccess();
            return;
          }

          setCurrentIdx((i) => i + 1);
          setFlipped(false);
          return;
        }

        // Permanent rejection or error
        setSessionStats((s) => ({ ...s, rejectedCount: s.rejectedCount + 1 }));
        Alert.alert("Progress not saved", result.reason);
      } finally {
        ratingInFlightRef.current.delete(currentCardId);
        if (isMountedRef.current) {
          setPendingRating(null);
        }
      }
    },
    [item, currentIdx, count, queryClient, hardReviewMode, user?.id],
  );

  const restartHardSession = () => {
    if (!hardReviewItems.length) return;
    setHardReviewMode(true);
    setSessionDone(false);
    setCurrentIdx(0);
    setFlipped(false);
    setSessionStats({
      hard: 0,
      medium: 0,
      easy: 0,
      total: 0,
      submittedCount: 0,
      queuedOfflineCount: 0,
      rejectedCount: 0,
      ratingCounts: {},
    });
  };

  const selectAllBooks = () => {
    const init: Record<string, boolean> = {};
    books.forEach((b) => {
      init[b.id] = true;
    });
    setSelectedBooks(init);
  };

  useEffect(() => {
    if (booksInitialized && activeBookIds.length === 0) {
      setShowFilters(true);
    }
  }, [booksInitialized, activeBookIds.length]);

  useEffect(() => {
    if (availableChapters.length > 0 && activeChapterNames?.length === 0) {
      setShowFilters(true);
    }
  }, [availableChapters.length, activeChapterNames?.length]);

  const initialLoading =
    (booksLoading || (queuePending && activeBookIds.length > 0)) &&
    reviewItems.length === 0 &&
    !hardReviewMode;

  const filtersOpen =
    showFilters ||
    (booksInitialized && activeBookIds.length === 0) ||
    (availableChapters.length > 0 && activeChapterNames?.length === 0);

  if (sessionDone) {
    return (
      <Screen>
        {header}
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
        >
          <StudySessionSummary
            stats={sessionStats}
            mode="study"
            onReviewHard={hardReviewItems.length > 0 ? restartHardSession : null}
          />
          {sessionStats.queuedOfflineCount > 0 ? (
            <Text style={[styles.offlineNotice, { color: colors.muted }]}>
              {sessionStats.queuedOfflineCount} rating(s) queued offline. They will sync automatically when online.
            </Text>
          ) : null}
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen>
      {header}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {initialLoading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.centerText, { color: colors.muted }]}>Loading due cards…</Text>
          </View>
        ) : booksError ? (
          <View style={styles.errorBox}>
            <Text style={[styles.errorTitle, { color: colors.text }]}>Unable to load library books</Text>
            <Text style={[styles.errorBody, { color: colors.muted }]}>
              Could not fetch your books to setup daily review. Please check your connection.
            </Text>
            <Pressable style={[styles.retryBtn, { backgroundColor: colors.primary }]} onPress={() => refetchBooks()}>
              <Text style={styles.retryBtnText}>Retry loading books</Text>
            </Pressable>
          </View>
        ) : books.length === 0 ? (
          <View style={styles.scopeEmpty}>
            <Text style={[styles.scopeTitle, { color: colors.text }]}>No books in library</Text>
            <Text style={[styles.scopeBody, { color: colors.muted }]}>
              Add books or generate flashcard sets to begin your daily review schedule.
            </Text>
            <Link href="/(tabs)/library" asChild>
              <Pressable style={[styles.retryBtn, { backgroundColor: colors.primary, marginTop: 16 }]}>
                <Text style={styles.retryBtnText}>Go to Library</Text>
              </Pressable>
            </Link>
          </View>
        ) : queueError && reviewItems.length === 0 && !hardReviewMode ? (
          <View style={styles.errorBox}>
            <Text style={[styles.errorTitle, { color: colors.text }]}>Unable to load daily review queue</Text>
            <Text style={[styles.errorBody, { color: colors.muted }]}>
              We couldn't reach the server to retrieve your due cards.
            </Text>
            <Pressable style={[styles.retryBtn, { backgroundColor: colors.primary }]} onPress={() => refetchQueue()}>
              <Text style={styles.retryBtnText}>Retry loading queue</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.session}>
            <View style={styles.topRow}>
              <Text style={[styles.brand, { color: colors.primary }]}>
                {hardReviewMode ? "Hard card review" : "Daily review"}
              </Text>
              {!hardReviewMode ? (
                <Pressable onPress={() => setShowFilters((v) => !v)}>
                  <Text style={[styles.filterBtn, { color: colors.primary }]}>Filter</Text>
                </Pressable>
              ) : null}
              {queueFetching && !hardReviewMode ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : null}
            </View>

            {count > 0 ? (
              <StudyProgressHeader
                current={currentIdx + 1}
                total={count}
                title={hardReviewMode ? "Hard card review" : "Daily Review"}
              />
            ) : null}

            {filtersOpen && !hardReviewMode ? (
              <View style={[styles.filterBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.filterHeaderRow}>
                  <Text style={[styles.filterTitle, { color: colors.muted }]}>BOOKS</Text>
                  <Pressable onPress={selectAllBooks}>
                    <Text style={[styles.selectAllText, { color: colors.primary }]}>Select all</Text>
                  </Pressable>
                </View>
                <ScrollView style={{ maxHeight: 120 }} nestedScrollEnabled>
                  {books.map((b) => (
                    <Pressable
                      key={b.id}
                      style={styles.filterRow}
                      onPress={() => {
                        void hapticImpact("light");
                        setSelectedBooks((prev) => ({ ...prev, [b.id]: !prev[b.id] }));
                      }}
                    >
                      <Text style={{ color: selectedBooks[b.id] ? colors.primary : colors.muted, fontSize: 16 }}>
                        {selectedBooks[b.id] ? "☑" : "☐"}
                      </Text>
                      <Text style={[styles.filterLabel, { color: colors.text }]} numberOfLines={1}>
                        {b.title}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
                {availableChapters.length > 0 ? (
                  <>
                    <Text style={[styles.filterTitle, { color: colors.muted, marginTop: 12 }]}>CHAPTERS</Text>
                    <ScrollView style={{ maxHeight: 160 }} nestedScrollEnabled>
                      {availableChapters.map((ch) => (
                        <Pressable
                          key={ch}
                          style={styles.filterRow}
                          onPress={() => {
                            void hapticImpact("light");
                            setSelectedChapters((prev) => ({ ...prev, [ch]: !prev[ch] }));
                          }}
                        >
                          <Text style={{ color: selectedChapters[ch] ? colors.primary : colors.muted, fontSize: 16 }}>
                            {selectedChapters[ch] ? "☑" : "☐"}
                          </Text>
                          <Text style={[styles.filterLabel, { color: colors.text }]} numberOfLines={2}>
                            {ch}
                          </Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </>
                ) : null}
              </View>
            ) : null}

            {item ? (
              <>
                <Text style={[styles.setTitle, { color: colors.muted }]} numberOfLines={1}>
                  {item.setTitle}
                </Text>
                {item.card.chapter ? (
                  <Text style={[styles.chapter, { color: colors.primary }]} numberOfLines={1}>
                    {item.card.chapter}
                  </Text>
                ) : null}
                <View style={styles.cardArea}>
                  <FlashCard
                    key={item.card.id}
                    front={item.card.front}
                    back={item.card.back}
                    chapter={item.card.chapter}
                    onFlippedChange={setFlipped}
                  />
                </View>
                {flipped ? (
                  <Animated.View entering={FadeIn} style={styles.ratingRow}>
                    <RecallRatingBar
                      onRate={(quality) => void rate(quality)}
                      qualities={[2, 3, 5]}
                      submittingQuality={pendingRating}
                    />
                  </Animated.View>
                ) : (
                  <Text style={[styles.hint, { color: colors.muted }]}>Tap card to flip and reveal answer</Text>
                )}
              </>
            ) : activeBookIds.length === 0 ? (
              <View style={styles.scopeEmpty}>
                <Text style={[styles.scopeTitle, { color: colors.text }]}>No books selected</Text>
                <Text style={[styles.scopeBody, { color: colors.muted }]}>
                  Select at least one book in the filter above to review due cards.
                </Text>
                <Pressable
                  style={[styles.retryBtn, { backgroundColor: colors.primary, marginTop: 14 }]}
                  onPress={selectAllBooks}
                >
                  <Text style={styles.retryBtnText}>Select all books</Text>
                </Pressable>
              </View>
            ) : availableChapters.length > 0 && activeChapterNames?.length === 0 ? (
              <View style={styles.scopeEmpty}>
                <Text style={[styles.scopeTitle, { color: colors.text }]}>No chapters selected</Text>
                <Text style={[styles.scopeBody, { color: colors.muted }]}>
                  Select at least one chapter in the filter above to continue your review.
                </Text>
              </View>
            ) : count === 0 && !hardReviewMode && !queueFetching ? (
              <View style={styles.scopeEmpty}>
                <Text style={[styles.scopeTitle, { color: colors.text }]}>
                  {activeBookIds.length === books.length ? "All caught up!" : "Nothing due for selected books"}
                </Text>
                <Text style={[styles.scopeBody, { color: colors.muted }]}>
                  {activeBookIds.length === books.length
                    ? "No flashcards are scheduled for review today across all your books."
                    : "No flashcards are scheduled for review in the selected book filter."}
                </Text>
                {activeBookIds.length < books.length ? (
                  <Pressable
                    style={[styles.retryBtn, { backgroundColor: colors.primary, marginTop: 14 }]}
                    onPress={selectAllBooks}
                  >
                    <Text style={styles.retryBtnText}>Check all books</Text>
                  </Pressable>
                ) : (
                  <View style={styles.emptyActions}>
                    <Link href="/(tabs)" asChild>
                      <Pressable style={[styles.retryBtn, { backgroundColor: colors.primary }]}>
                        <Text style={styles.retryBtnText}>Back Home</Text>
                      </Pressable>
                    </Link>
                    <Link href="/(tabs)/flashcards" asChild>
                      <Pressable style={[styles.secondaryAction, { borderColor: colors.borderStrong }]}>
                        <Text style={[styles.secondaryActionText, { color: colors.text }]}>Study something else</Text>
                      </Pressable>
                    </Link>
                  </View>
                )}
              </View>
            ) : queueFetching ? (
              <View style={styles.center}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : null}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scrollContent: { flexGrow: 1, paddingBottom: 24 },
  center: { alignItems: "center", justifyContent: "center", marginTop: 48, gap: 8 },
  centerText: { fontSize: 15 },
  session: { flex: 1, paddingHorizontal: 16, paddingBottom: 16 },
  topRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  brand: { fontSize: 14, fontWeight: "700" },
  filterBtn: { fontSize: 13, fontWeight: "700" },
  filterBox: { borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 10 },
  filterHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  filterTitle: { fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  selectAllText: { fontSize: 12, fontWeight: "600" },
  filterRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  filterLabel: { flex: 1, fontSize: 14, fontWeight: "500" },
  setTitle: { fontSize: 12, textAlign: "center", marginBottom: 2 },
  chapter: { fontSize: 12, textAlign: "center", fontWeight: "600", marginBottom: 8 },
  cardArea: { minHeight: 280, justifyContent: "center" },
  hint: { textAlign: "center", fontSize: 14, marginBottom: 12 },
  ratingRow: { marginBottom: 12 },
  scopeEmpty: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 24, paddingVertical: 32 },
  scopeTitle: { fontSize: 18, fontWeight: "700", textAlign: "center", marginBottom: 8 },
  scopeBody: { fontSize: 14, lineHeight: 20, textAlign: "center" },
  errorBox: { marginHorizontal: 20, marginTop: 40, alignItems: "center" },
  errorTitle: { fontSize: 18, fontWeight: "700", textAlign: "center", marginBottom: 8 },
  errorBody: { fontSize: 14, textAlign: "center", marginBottom: 16, lineHeight: 20 },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10 },
  retryBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  offlineNotice: { textAlign: "center", fontSize: 12, marginTop: 12, paddingHorizontal: 20 },
  emptyActions: { width: "100%", maxWidth: 320, marginTop: 18, gap: 10 },
  secondaryAction: { minHeight: 44, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  secondaryActionText: { fontWeight: "700", fontSize: 14 },
});
