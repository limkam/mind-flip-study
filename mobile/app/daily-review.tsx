import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import { FlashCard } from "../components/FlashCard";
import { Screen } from "../components/Screen";
import { StudySessionSummary } from "../components/study/StudySessionSummary";
import { api } from "../api/client";
import { useScreenHeader } from "../hooks/useScreenHeader";
import { useTheme } from "../hooks/useTheme";
import { hapticImpact, hapticSuccess } from "../lib/haptics";
import { useAuthStore } from "../store/authStore";
import type { BookOut, DueFlashcardOut, Paginated } from "../types/api";

const RATING_TO_QUALITY = { hard: 2, medium: 3, easy: 5 } as const;

type ReviewItem = {
  card: { id: string; front: string; back: string; chapter?: string | null };
  setTitle: string;
  bookTitle?: string | null;
  bookId?: string | null;
};

function mapReviewRows(rows: DueFlashcardOut[]): ReviewItem[] {
  return rows.map((row) => ({
    card: { id: row.id, front: row.front, back: row.back, chapter: row.chapter },
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

  const [currentIdx, setCurrentIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [sessionDone, setSessionDone] = useState(false);
  const [pendingRating, setPendingRating] = useState<keyof typeof RATING_TO_QUALITY | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedBooks, setSelectedBooks] = useState<Record<string, boolean>>({});
  const [selectedChapters, setSelectedChapters] = useState<Record<string, boolean>>({});
  const [hardReviewMode, setHardReviewMode] = useState(false);
  const [hardReviewItems, setHardReviewItems] = useState<ReviewItem[]>([]);
  const [sessionStats, setSessionStats] = useState({ hard: 0, medium: 0, easy: 0, total: 0 });
  const sessionStart = useRef(Date.now());

  const { data: books = [] } = useQuery({
    queryKey: ["books-daily-review"],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await api.get<Paginated<BookOut>>("/books/", { params: { page: 1, size: 100 } });
      return data.items ?? [];
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

  const { data: reviewItems = [], isPending, isFetching } = useQuery({
    queryKey: ["daily-review-queue", user?.id, activeBookIds],
    enabled: !!user && booksInitialized && activeBookIds.length > 0 && !hardReviewMode,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const params: Record<string, string | number | string[]> = { limit: 100 };
      if (activeBookIds.length === 1) params.book_id = activeBookIds[0];
      else if (activeBookIds.length > 1) params.book_ids = activeBookIds;

      const { data } = await api.get<DueFlashcardOut[]>("/study/daily-review", {
        params,
        paramsSerializer: { indexes: null },
      });

      const idSet = new Set(activeBookIds.map(String));
      const filtered = (data || []).filter((r) => r.book_id && idSet.has(String(r.book_id)));
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
    if (books.length && Object.keys(selectedBooks).length === 0) {
      const init: Record<string, boolean> = {};
      books.forEach((b) => {
        init[b.id] = true;
      });
      setSelectedBooks(init);
    }
  }, [books, selectedBooks]);

  useEffect(() => {
    if (!availableChapters.length) {
      setSelectedChapters({});
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

  useEffect(() => {
    setCurrentIdx(0);
    setFlipped(false);
    setPendingRating(null);
    setSelectedChapters({});
  }, [activeBookIds.join("|")]);

  useEffect(() => {
    setCurrentIdx(0);
    setFlipped(false);
    setPendingRating(null);
  }, [activeChapterNames?.join("|")]);

  useEffect(() => {
    setPendingRating(null);
  }, [currentIdx]);

  useEffect(() => {
    if (currentIdx >= count && count > 0) {
      setCurrentIdx(count - 1);
    }
  }, [count, currentIdx]);

  const rate = useCallback(
    async (rating: keyof typeof RATING_TO_QUALITY) => {
      if (!item || pendingRating) return;
      setPendingRating(rating);
      const quality = RATING_TO_QUALITY[rating];
      setSessionStats((s) => ({
        ...s,
        total: s.total + 1,
        [rating]: (s[rating as keyof typeof s] as number) + 1,
      }));
      if (rating === "hard" && !hardReviewMode) {
        setHardReviewItems((items) =>
          items.some((i) => i.card.id === item.card.id) ? items : [...items, item],
        );
      }
      try {
        await api.post("/study/progress", { card_id: item.card.id, quality });
        await queryClient.invalidateQueries({ queryKey: ["daily-review-queue"] });
        if (rating === "easy") void hapticSuccess();
        else void hapticImpact("medium");
        if (currentIdx >= count - 1) {
          setSessionDone(true);
          return;
        }
        setCurrentIdx((i) => i + 1);
        setFlipped(false);
      } catch {
        setPendingRating(null);
        setSessionStats((s) => ({
          ...s,
          total: Math.max(0, s.total - 1),
          [rating]: Math.max(0, (s[rating as keyof typeof s] as number) - 1),
        }));
      }
    },
    [item, currentIdx, count, queryClient, pendingRating, hardReviewMode],
  );

  const restartHardSession = () => {
    if (!hardReviewItems.length) return;
    setHardReviewMode(true);
    setSessionDone(false);
    setCurrentIdx(0);
    setFlipped(false);
    setSessionStats({ hard: 0, medium: 0, easy: 0, total: 0 });
    sessionStart.current = Date.now();
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

  const scopeMessage = useMemo(() => {
    if (booksInitialized && activeBookIds.length === 0) {
      return {
        title: "No books selected",
        body: "Select at least one book below to continue your review.",
      };
    }
    if (availableChapters.length > 0 && activeChapterNames?.length === 0) {
      return {
        title: "No chapters selected",
        body: "Select at least one chapter below to continue your review.",
      };
    }
    if (count === 0 && !hardReviewMode && !isFetching && activeBookIds.length > 0) {
      return {
        title: "Nothing due today",
        body: "No flashcards are scheduled for review in this scope.",
      };
    }
    return null;
  }, [
    booksInitialized,
    activeBookIds.length,
    availableChapters.length,
    activeChapterNames?.length,
    count,
    hardReviewMode,
    isFetching,
  ]);

  const filtersOpen =
    showFilters
    || (booksInitialized && activeBookIds.length === 0)
    || (availableChapters.length > 0 && activeChapterNames?.length === 0);

  const progressLabel = useMemo(
    () => (count ? `${Math.min(currentIdx + 1, count)} / ${count}` : "0 / 0"),
    [currentIdx, count],
  );

  const initialLoading = isPending && reviewItems.length === 0 && activeBookIds.length > 0 && !hardReviewMode;

  if (sessionDone) {
    return (
      <Screen>
        {header}
        <StudySessionSummary
          stats={{ ...sessionStats, durationMs: Date.now() - sessionStart.current }}
          mode="study"
          onReviewHard={hardReviewItems.length > 0 ? restartHardSession : null}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      {header}
      {initialLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
          <Text style={[styles.centerText, { color: colors.muted }]}>Loading due cards…</Text>
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
            {isFetching && !hardReviewMode ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : null}
            <Text style={[styles.progress, { color: colors.muted }]}>{progressLabel}</Text>
          </View>

          {filtersOpen && !hardReviewMode ? (
            <View style={[styles.filterBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.filterTitle, { color: colors.muted }]}>BOOKS</Text>
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

          {!hardReviewMode ? (
            <View style={[styles.ratingHelp, { backgroundColor: `${colors.primary}10`, borderColor: `${colors.primary}22` }]}>
              <Text style={[styles.helpTitle, { color: colors.text }]}>How ratings work</Text>
              <Text style={[styles.helpLine, { color: colors.muted }]}>
                <Text style={{ color: colors.danger, fontWeight: "700" }}>Hard</Text> — reviewed again soon
              </Text>
              <Text style={[styles.helpLine, { color: colors.muted }]}>
                <Text style={{ color: colors.warning, fontWeight: "700" }}>OK</Text> — normal review interval
              </Text>
              <Text style={[styles.helpLine, { color: colors.muted }]}>
                <Text style={{ color: colors.success, fontWeight: "700" }}>Easy</Text> — longer interval before next review
              </Text>
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
                  onSwipeLeft={() => rate("hard")}
                  onSwipeRight={() => rate("easy")}
                />
              </View>
              {flipped ? (
                <Animated.View entering={FadeIn} style={styles.ratingRow}>
                  <RateBtn label="Hard" color={colors.danger} active={pendingRating === "hard"} onPress={() => rate("hard")} />
                  <RateBtn label="OK" color={colors.warning} active={pendingRating === "medium"} onPress={() => rate("medium")} />
                  <RateBtn label="Easy" color={colors.success} active={pendingRating === "easy"} onPress={() => rate("easy")} />
                </Animated.View>
              ) : (
                <Text style={[styles.hint, { color: colors.muted }]}>Tap to flip, then rate to continue</Text>
              )}
            </>
          ) : scopeMessage ? (
            <View style={styles.scopeEmpty}>
              <Text style={[styles.scopeTitle, { color: colors.text }]}>{scopeMessage.title}</Text>
              <Text style={[styles.scopeBody, { color: colors.muted }]}>{scopeMessage.body}</Text>
            </View>
          ) : isFetching ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : null}
        </View>
      )}
    </Screen>
  );
}

function RateBtn({
  label,
  color,
  active,
  onPress,
}: {
  label: string;
  color: string;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.rateBtn, { backgroundColor: color }, active && styles.rateBtnActive]} onPress={onPress}>
      <Text style={styles.rateBtnText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center", marginTop: 48, gap: 8 },
  centerText: { fontSize: 15 },
  session: { flex: 1, paddingHorizontal: 16, paddingBottom: 16 },
  topRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  brand: { fontSize: 14, fontWeight: "700" },
  filterBtn: { fontSize: 13, fontWeight: "700" },
  progress: { fontSize: 13, fontWeight: "600", marginLeft: "auto" },
  filterBox: { borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 10 },
  filterTitle: { fontSize: 10, fontWeight: "700", letterSpacing: 0.5, marginBottom: 8 },
  filterRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  filterLabel: { flex: 1, fontSize: 14, fontWeight: "500" },
  ratingHelp: { borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 12 },
  helpTitle: { fontSize: 13, fontWeight: "700", marginBottom: 6 },
  helpLine: { fontSize: 12, lineHeight: 18 },
  setTitle: { fontSize: 12, textAlign: "center", marginBottom: 2 },
  chapter: { fontSize: 12, textAlign: "center", fontWeight: "600", marginBottom: 8 },
  cardArea: { flex: 1, justifyContent: "center", minHeight: 280 },
  hint: { textAlign: "center", fontSize: 14, marginBottom: 12 },
  ratingRow: { flexDirection: "row", justifyContent: "center", gap: 10, marginBottom: 12 },
  rateBtn: {
    minHeight: 44,
    minWidth: 80,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  rateBtnActive: { transform: [{ scale: 1.05 }], opacity: 0.92 },
  rateBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  scopeEmpty: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 24, paddingVertical: 32 },
  scopeTitle: { fontSize: 18, fontWeight: "700", textAlign: "center", marginBottom: 8 },
  scopeBody: { fontSize: 14, lineHeight: 20, textAlign: "center" },
});
