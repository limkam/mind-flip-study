import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, {
  FadeIn,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FlashCard } from "../../components/FlashCard";
import { GameSelector } from "../../components/games";
import { Screen } from "../../components/Screen";
import { StudySessionSummary } from "../../components/study/StudySessionSummary";
import { RecallRatingBar } from "../../components/study/RecallRatingBar";
import { StudyProgressHeader } from "../../components/study/StudyProgressHeader";
import { StudySetHeader } from "../../components/study/StudySetHeader";
import { ScenarioView } from "../../components/study/ScenarioView";
import { EmptyState } from "../../components/EmptyState";
import { IconButton, Segmented, type SegmentedOption } from "../../components/ui";
import { StudySkeleton } from "../../components/skeletons/StudySkeleton";
import { api } from "../../api/client";
import { useTheme } from "../../hooks/useTheme";
import { TOKENS } from "../../theme/tokens";
import { useCelebration } from "../../context/CelebrationContext";
import { MIN_GAME_CARDS } from "../../lib/gameUtils";
import { fetchEntitlementsSnapshot } from "../../lib/billing";
import {
  cacheStudySet,
  getCachedStudySet,
  queueProgressSync,
} from "../../lib/offlineStudy";
import { submitStudyProgress } from "../../lib/studyProgress";
import { invalidateAfterStudyProgress } from "../../lib/studyInvalidation";
import { maybeRegisterPushAfterStudy } from "../../hooks/usePushNotifications";
import { hapticImpact, hapticSuccess } from "../../lib/haptics";
import { useAuthStore } from "../../store/authStore";
import type { DueFlashcardOut, FlashcardSetOut, ScenarioOut, StudyProgressOut } from "../../types/api";
import { parseStudySetDisplay } from "../../lib/studySetDisplay";
import type { GameSlug } from "../../components/games/types";

type StudyMode = "study" | "summary" | "scenarios" | "games";

const STUDY_MODES: SegmentedOption<StudyMode>[] = [
  { value: "study", label: "Study" },
  { value: "summary", label: "Summary" },
  { value: "scenarios", label: "Scenarios" },
  { value: "games", label: "Games" },
];

type StudyCard = {
  id: string;
  front: string;
  back: string;
  difficulty?: string | null;
  chapter?: string | null;
};

export default function StudyByIdScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const studySettings = user?.preferences?.settings as { auto_advance_cards?: boolean; auto_advance_delay_ms?: number } | undefined;
  const autoAdvance = studySettings?.auto_advance_cards ?? true;
  const autoAdvanceDelay = studySettings?.auto_advance_delay_ms ?? 2000;

  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [mode, setMode] = useState<StudyMode>("study");
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [hardReviewMode, setHardReviewMode] = useState(false);
  const [offlineNote, setOfflineNote] = useState(false);
  const [queuedOfflineCount, setQueuedOfflineCount] = useState(0);
  const [localScenarios, setLocalScenarios] = useState<ScenarioOut[] | null>(null);
  const [submittingQuality, setSubmittingQuality] = useState<number | null>(null);
  const [ratedCardId, setRatedCardId] = useState<string | null>(null);
  const ratingInFlight = useRef(false);
  const serverProgress = useRef<Record<string, StudyProgressOut>>({});
  const sessionVersionRef = useRef(0);
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: entitlements } = useQuery({
    queryKey: ["billing-entitlements"],
    queryFn: fetchEntitlementsSnapshot,
  });
  const gameLimit = entitlements?.features?.games_limit ?? 2;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["study-session", id],
    enabled: !!id,
    queryFn: async () => {
      const setId = id as string;
      let setMeta: FlashcardSetOut | null = null;
      let due: DueFlashcardOut[] = [];
      let fromCache = false;

      try {
        const [setRes, dueRes] = await Promise.all([
          api.get<FlashcardSetOut>(`/flashcard-sets/${setId}`),
          api.get<DueFlashcardOut[]>("/study/due-cards", {
            params: { set_id: setId, limit: 20 },
          }),
        ]);
        setMeta = setRes.data;
        due = dueRes.data;
        cacheStudySet(setMeta);
      } catch {
        const cached = getCachedStudySet(setId);
        if (!cached) throw new Error("offline");
        fromCache = true;
        setMeta = {
          id: cached.id,
          user_id: user?.id ?? "",
          title: cached.title,
          book_title: cached.book_title,
          card_count: cached.cards.length,
          book_id: null,
          cards: cached.cards,
          tags: [],
        };
        due = cached.cards.map((c) => ({
          ...c,
          set_title: cached.title,
          ease_factor: null,
          interval_days: null,
          next_review_date: null,
          repetitions: null,
        }));
      }

      const cards: StudyCard[] = (due.length ? due : []).map((c) => ({
        id: c.id,
        front: c.front,
        back: c.back,
        difficulty: (c as { difficulty?: string }).difficulty ?? null,
        chapter: (c as { chapter?: string }).chapter ?? null,
      }));

      const allCards: StudyCard[] = (setMeta?.cards ?? []).map((c) => ({
        id: c.id,
        front: c.front,
        back: c.back,
        difficulty: c.difficulty ?? null,
        chapter: c.chapter ?? null,
      }));

      return {
        title: setMeta?.title ?? "Study",
        bookTitle: setMeta?.book_title,
        selectedChapters: setMeta?.selected_chapters ?? [],
        cardCount: setMeta?.card_count ?? allCards.length,
        summary: setMeta?.summary ?? null,
        scenarios: setMeta?.scenarios ?? [],
        chapterSummaries: setMeta?.chapter_summaries ?? [],
        generationSeed: setMeta?.generation_seed ?? 0,
        cards,
        allCards,
        fromCache,
      };
    },
  });

  const cards = data?.cards ?? [];
  const allCards = data?.allCards ?? [];
  const hardCards = useMemo(
    () => cards.filter((c) => (ratings[c.id] ?? 0) <= 2),
    [cards, ratings],
  );
  const activeCards = hardReviewMode ? hardCards : cards;
  const card = activeCards[idx];
  const total = activeCards.length;

  useEffect(() => {
    sessionVersionRef.current += 1;
    if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    setIdx(0);
    setFlipped(false);
    setSessionComplete(false);
    setMode("study");
    setRatings({});
    setHardReviewMode(false);
    setOfflineNote(false);
    setQueuedOfflineCount(0);
    setLocalScenarios(null);
    setSubmittingQuality(null);
    setRatedCardId(null);
    return () => {
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    };
  }, [id]);

  useEffect(() => {
    ratingInFlight.current = false;
    setSubmittingQuality(null);
    setRatedCardId(null);
  }, [idx, hardReviewMode]);

  const sessionSummaryStats = useMemo(() => {
    const entries = Object.entries(ratings);
    const hard = entries.filter(([, q]) => q <= 2).length;
    const medium = entries.filter(([, q]) => q === 3 || q === 4).length;
    const easy = entries.filter(([, q]) => q >= 5).length;
    const totalRated = entries.length;
    const ratingCounts = entries.reduce<Partial<Record<1 | 2 | 3 | 4 | 5, number>>>((counts, [, quality]) => {
      const key = quality as 1 | 2 | 3 | 4 | 5;
      counts[key] = (counts[key] ?? 0) + 1;
      return counts;
    }, {});
    return {
      total: totalRated,
      hard,
      medium,
      easy,
      ratingCounts,
      queuedOfflineCount,
    };
  }, [ratings, cards.length, queuedOfflineCount]);

  const { requestMany: requestCelebrations } = useCelebration();

  const submitProgress = useCallback(
    async (cardId: string, quality: number) => {
      const result = await submitStudyProgress(
        { card_id: cardId, quality },
        queueProgressSync,
      );
      if (result.status === "submitted") {
        serverProgress.current[result.progress.card_id] = result.progress;
        void requestCelebrations(result.progress);
        if (user?.id) {
          await invalidateAfterStudyProgress(queryClient, {
            expectedUserId: user.id,
            setIds: id ? [id] : [],
            cardIds: [result.progress.card_id],
          });
        }
      } else if (result.status === "queued") {
        setOfflineNote(true);
        setQueuedOfflineCount((count) => count + 1);
      }
      return result;
    },
    [id, queryClient, requestCelebrations, user?.id],
  );

  const rateAndAdvance = useCallback(
    (quality: number) => {
      if (sessionComplete || !card || ratingInFlight.current) return;
      ratingInFlight.current = true;
      setSubmittingQuality(quality);
      const ratedCard = card;
      const expectedSessionVersion = sessionVersionRef.current;
      const expectedUserId = user?.id;

      // Advance the UI immediately; submitProgress (network + invalidation)
      // runs in the background so the rating never blocks the next card.
      void submitProgress(ratedCard.id, quality).then((result) => {
        if (
          expectedSessionVersion !== sessionVersionRef.current
          || expectedUserId !== useAuthStore.getState().user?.id
        ) return;
        if (result.status === "rejected" || result.status === "authentication") {
          ratingInFlight.current = false;
          setRatedCardId((current) => (current === ratedCard.id ? null : current));
          setSubmittingQuality(null);
          Alert.alert("Progress not saved", result.reason);
        }
      });

      setRatings((prev) => ({ ...prev, [ratedCard.id]: quality }));

      void hapticImpact("light");

      const isLast = idx >= activeCards.length - 1;
      const advance = () => {
        if (isLast) {
          setSessionComplete(true);
          void hapticSuccess();
          void maybeRegisterPushAfterStudy();
          return;
        }
        setIdx((i) => i + 1);
        setFlipped(false);
      };
      if (autoAdvance) {
        advanceTimerRef.current = setTimeout(() => {
          if (expectedSessionVersion === sessionVersionRef.current) advance();
        }, autoAdvanceDelay);
      } else if (isLast) {
        advance();
      } else {
        setRatedCardId(ratedCard.id);
        setSubmittingQuality(null);
      }
    },
    [card, activeCards.length, idx, sessionComplete, submitProgress, autoAdvance, autoAdvanceDelay, user?.id],
  );


  const displayTitle = parseStudySetDisplay({
    title: data?.title,
    book_title: data?.bookTitle,
    selected_chapters: data?.selectedChapters,
  }).title;

  const scenarios = localScenarios ?? data?.scenarios ?? [];

  return (
    <Screen edges={["bottom"]} style={{ backgroundColor: colors.background }}>
      <Stack.Screen
        options={{
          title: displayTitle || "Study",
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
        }}
      />

      <View style={styles.headerRow}>
        <View style={styles.headerSpacer} />
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          {sessionComplete ? "Summary" : `Card ${Math.min(idx + 1, total || 1)} of ${total || 0}`}
        </Text>
        <IconButton
          icon="close"
          accessibilityLabel="Close study session"
          onPress={() => router.back()}
          variant="filled"
        />
      </View>

      <Segmented
        options={STUDY_MODES}
        value={mode}
        onChange={setMode}
        accessibilityLabel="Study mode"
        style={styles.modeSwitcher}
      />

      {data && mode !== "study" ? (
        <StudySetHeader
          setMeta={{
            title: data.title,
            book_title: data.bookTitle,
            selected_chapters: data.selectedChapters,
            card_count: data.cardCount,
          }}
          cardCount={data.cardCount}
        />
      ) : null}

      {offlineNote || data?.fromCache ? (
        <Text style={[styles.offlineBanner, { backgroundColor: colors.surface, color: colors.warning }]}>
          {data?.fromCache ? "Offline — using saved deck" : "Offline — progress saved locally"}
        </Text>
      ) : null}

      {mode !== "study" || !total ? null : (
        <View style={styles.progressWrap}>
          <StudyProgressHeader current={sessionComplete ? total : idx + 1} total={total} title={displayTitle || "Study"} />
        </View>
      )}

      {isLoading ? (
        <StudySkeleton />
      ) : isError ? (
        <EmptyState
          icon="alert-circle-outline"
          title="Could not load"
          message="Check your connection or try again."
          actionLabel="Retry"
          onAction={() => refetch()}
        />
      ) : mode === "summary" ? (
        <ScrollView
          contentContainerStyle={[styles.tabScroll, { paddingBottom: TOKENS.spacing.xxl + insets.bottom }]}
          showsVerticalScrollIndicator
        >
          {data?.summary ? (
            <View style={[styles.summaryBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.summaryTitle, { color: colors.text }]}>Study Summary</Text>
              <Text style={[styles.summaryBody, { color: colors.muted }]}>{data.summary}</Text>
            </View>
          ) : null}
          {(data?.chapterSummaries ?? []).map((ch) => (
            <View
              key={ch.chapter}
              style={[styles.summaryBox, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <Text style={[styles.summaryTitle, { color: colors.text }]}>{ch.chapter}</Text>
              <Text style={[styles.summaryBody, { color: colors.muted }]}>{ch.summary}</Text>
            </View>
          ))}
        </ScrollView>
      ) : mode === "scenarios" ? (
        <ScrollView
          contentContainerStyle={[styles.tabScroll, { paddingBottom: TOKENS.spacing.xxl + insets.bottom }]}
          showsVerticalScrollIndicator
        >
          <ScenarioView
            scenarios={scenarios}
            setId={id as string}
            onScenariosChange={setLocalScenarios}
          />
        </ScrollView>
      ) : mode === "games" ? (
        <ScrollView
          contentContainerStyle={[styles.tabScroll, { paddingBottom: TOKENS.spacing.xxl + insets.bottom }]}
          showsVerticalScrollIndicator
        >
          {allCards.length < MIN_GAME_CARDS ? (
            <EmptyState
              icon="game-controller-outline"
              title="Not enough cards"
              message={`Games need at least ${MIN_GAME_CARDS} cards. This set has ${allCards.length}.`}
            />
          ) : (
            <GameSelector
              onSelect={(slug: GameSlug) => {
                router.push(`/games/${id}/${slug}`);
              }}
            />
          )}
        </ScrollView>
      ) : !total ? (
        <EmptyState
          icon="checkmark-done-outline"
          title="All caught up!"
          message="No cards are due for review in this set right now."
          actionLabel="View summaries"
          onAction={() => setMode("summary")}
        />
      ) : sessionComplete ? (
        <ScrollView
          contentContainerStyle={[styles.summaryScroll, { paddingBottom: TOKENS.spacing.xxl + insets.bottom }]}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View entering={FadeIn}>
            <StudySessionSummary
              stats={sessionSummaryStats}
              mode="study"
              onReviewHard={
                sessionSummaryStats.hard > 0
                  ? () => {
                      setHardReviewMode(true);
                      setSessionComplete(false);
                      setIdx(0);
                      setFlipped(false);
                    }
                  : null
              }
              onContinue={() => {
                setSessionComplete(false);
                setHardReviewMode(false);
                setIdx(0);
                setFlipped(false);
              }}
            />
          </Animated.View>
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.studyScroll, { paddingBottom: TOKENS.spacing.lg + insets.bottom }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.cardArea}>
            <FlashCard
              key={card.id}
              front={card.front}
              back={card.back}
              difficulty={card.difficulty}
              chapter={card.chapter}
              onFlippedChange={setFlipped}
            />
          </View>

          {flipped ? (
            <Animated.View entering={FadeIn} style={styles.ratingRow}>
              <RecallRatingBar
                onRate={rateAndAdvance}
                qualities={[1, 2, 4, 5]}
                submittingQuality={submittingQuality}
                disabled={ratedCardId === card.id}
              />
            </Animated.View>
          ) : (
            <Text style={[styles.flipHint, { color: colors.muted }]}>Flip the card to rate your recall</Text>
          )}

          {!autoAdvance && ratedCardId === card.id ? (
            <View style={styles.navRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Next card"
                style={[styles.navBtn, { backgroundColor: colors.primary }]}
                onPress={() => {
                  void hapticImpact("light");
                  setIdx((i) => Math.min(total - 1, i + 1));
                  setFlipped(false);
                }}
              >
                <Text style={[styles.navBtnText, { color: colors.onPrimary }]}>Next card</Text>
              </Pressable>
            </View>
          ) : null}
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
  headerTitle: { fontSize: 16, fontWeight: "700", flex: 1, textAlign: "center" },
  headerSpacer: { width: TOKENS.layout.minTouchTarget },
  modeSwitcher: { marginHorizontal: 16, marginBottom: 8 },
  tabScroll: { paddingHorizontal: 16, paddingBottom: 32 },
  summaryScroll: { flexGrow: 1, justifyContent: "center" },
  studyScroll: { flexGrow: 1 },
  summaryBox: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  summaryTitle: { fontSize: 18, fontWeight: "700", marginBottom: 8 },
  summaryBody: { fontSize: 14, lineHeight: 21 },
  offlineBanner: {
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 10,
    borderRadius: 10,
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
  },
  progressWrap: { paddingHorizontal: 16, marginBottom: 12 },
  cardArea: { flex: 1, paddingHorizontal: 16, justifyContent: "center" },
  flipHint: { textAlign: "center", fontSize: 14, marginBottom: 12, paddingHorizontal: 16 },
  ratingRow: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  navRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  navBtn: {
    minHeight: 44,
    minWidth: 100,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  navBtnText: { fontWeight: "600", fontSize: 15 },
});
