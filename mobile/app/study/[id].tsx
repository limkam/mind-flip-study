import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { FlashCard } from "../../components/FlashCard";
import { GameSelector } from "../../components/games";
import { Screen } from "../../components/Screen";
import { SummaryView as SessionSummaryView } from "../../components/SummaryView";
import { ChapterSummaryView } from "../../components/study/ChapterSummaryView";
import { EmptyState } from "../../components/EmptyState";
import { StudySkeleton } from "../../components/skeletons/StudySkeleton";
import { api } from "../../api/client";
import { useTheme } from "../../hooks/useTheme";
import { MIN_GAME_CARDS } from "../../lib/gameUtils";
import {
  cacheStudySet,
  getCachedStudySet,
  isOnline,
  queueProgressSync,
} from "../../lib/offlineStudy";
import { maybeRegisterPushAfterStudy } from "../../hooks/usePushNotifications";
import { hapticImpact, hapticSuccess } from "../../lib/haptics";
import type { DueFlashcardOut, FlashcardSetOut } from "../../types/api";
import type { GameSlug } from "../../components/games/types";

type StudyMode = "study" | "summary" | "games";

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

  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [mode, setMode] = useState<StudyMode>("study");
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [offlineNote, setOfflineNote] = useState(false);

  const progress = useSharedValue(0);

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
          title: cached.title,
          book_title: cached.book_title,
          card_count: cached.cards.length,
          book_id: null,
          cards: cached.cards,
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
        cards,
        allCards,
        fromCache,
      };
    },
  });

  const cards = data?.cards ?? [];
  const allCards = data?.allCards ?? [];
  const card = cards[idx];
  const total = cards.length;

  useEffect(() => {
    setIdx(0);
    setFlipped(false);
    setSessionComplete(false);
    setMode("study");
    setRatings({});
    setOfflineNote(false);
    progress.value = 0;
  }, [id, progress]);

  useEffect(() => {
    if (total > 0) {
      progress.value = withTiming((sessionComplete ? total : idx) / total, { duration: 300 });
    }
  }, [idx, total, sessionComplete, progress]);

  const progressStyle = useAnimatedStyle(() => ({
    width: `${Math.min(100, Math.max(0, progress.value * 100))}%`,
  }));

  const avgQuality = useMemo(() => {
    const values = Object.values(ratings);
    if (!values.length) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }, [ratings]);

  const submitProgress = useCallback(
    async (cardId: string, quality: number) => {
      const online = await isOnline();
      if (online) {
        try {
          await api.post("/study/progress", { card_id: cardId, quality });
          return;
        } catch {
          /* queue below */
        }
      }
      queueProgressSync({ card_id: cardId, quality });
      setOfflineNote(true);
    },
    [],
  );

  const rateAndAdvance = useCallback(
    async (quality: number) => {
      if (sessionComplete || !card) return;
      setRatings((prev) => ({ ...prev, [card.id]: quality }));
      await submitProgress(card.id, quality);

      if (quality <= 2) void hapticImpact("heavy");
      else if (quality >= 4) void hapticSuccess();
      else void hapticImpact("medium");

      const isLast = idx >= cards.length - 1;
      if (isLast) {
        setSessionComplete(true);
        void hapticSuccess();
        void maybeRegisterPushAfterStudy();
        return;
      }
      setIdx((i) => i + 1);
      setFlipped(false);
    },
    [card, cards.length, idx, sessionComplete, submitProgress],
  );

  const restartSession = useCallback(() => {
    setIdx(0);
    setFlipped(false);
    setSessionComplete(false);
    setRatings({});
    void refetch();
  }, [refetch]);

  const title = data?.title ?? "Study";

  return (
    <Screen edges={["bottom"]} style={{ backgroundColor: colors.background }}>
      <Stack.Screen
        options={{
          title,
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
        }}
      />

      <View style={styles.headerRow}>
        <Pressable
          style={[styles.iconBtn, { backgroundColor: colors.surface }]}
          onPress={() => {
            void hapticImpact("light");
            router.back();
          }}
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          {sessionComplete ? "Summary" : `Card ${Math.min(idx + 1, total || 1)} of ${total || 0}`}
        </Text>
        <Pressable
          style={[styles.iconBtn, { backgroundColor: colors.surface }]}
          onPress={() => {
            void hapticImpact("light");
            router.back();
          }}
          hitSlop={8}
        >
          <Ionicons name="close" size={22} color={colors.text} />
        </Pressable>
      </View>

      <View style={[styles.tabRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <TabButton label="Study" active={mode === "study"} onPress={() => setMode("study")} colors={colors} />
        <TabButton label="Summary" active={mode === "summary"} onPress={() => setMode("summary")} colors={colors} />
        <TabButton label="Games" active={mode === "games"} onPress={() => setMode("games")} colors={colors} />
      </View>

      {offlineNote || data?.fromCache ? (
        <Text style={[styles.offlineBanner, { backgroundColor: colors.surface, color: colors.warning }]}>
          {data?.fromCache ? "Offline — using saved deck" : "Offline — progress saved locally"}
        </Text>
      ) : null}

      {mode !== "study" ? null : (
        <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
          <Animated.View style={[styles.progressFill, progressStyle, { backgroundColor: colors.primary }]} />
        </View>
      )}

      {isLoading ? (
        <StudySkeleton />
      ) : isError ? (
        <EmptyState
          icon="⚠️"
          title="Could not load"
          message="Check your connection or try again."
          actionLabel="Retry"
          onAction={() => refetch()}
        />
      ) : mode === "summary" ? (
        <ScrollView contentContainerStyle={styles.tabScroll} showsVerticalScrollIndicator>
          <ChapterSummaryView cards={allCards} bookTitle={data?.bookTitle} />
        </ScrollView>
      ) : mode === "games" ? (
        <ScrollView contentContainerStyle={styles.tabScroll} showsVerticalScrollIndicator>
          {allCards.length < MIN_GAME_CARDS ? (
            <EmptyState
              icon="🎮"
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
          icon="🎉"
          title="All caught up!"
          message="No cards are due for review in this set right now."
          actionLabel="View summaries"
          onAction={() => setMode("summary")}
        />
      ) : sessionComplete ? (
        <Animated.View entering={FadeIn}>
          <SessionSummaryView
            totalCards={Object.keys(ratings).length || total}
            avgQuality={avgQuality}
            onRetry={restartSession}
            onDone={() => router.back()}
          />
        </Animated.View>
      ) : (
        <>
          <View style={styles.cardArea}>
            <FlashCard
              key={card.id}
              front={card.front}
              back={card.back}
              difficulty={card.difficulty}
              chapter={card.chapter}
              onFlippedChange={setFlipped}
              onSwipeLeft={() => rateAndAdvance(1)}
              onSwipeRight={() => rateAndAdvance(5)}
            />
          </View>

          {flipped ? (
            <Animated.View entering={FadeIn} style={styles.ratingRow}>
              <RatingButton label="Again" quality={1} color={colors.danger} onPress={() => rateAndAdvance(1)} />
              <RatingButton label="Hard" quality={2} color={colors.warning} onPress={() => rateAndAdvance(2)} />
              <RatingButton label="Good" quality={4} color={colors.primary} onPress={() => rateAndAdvance(4)} />
              <RatingButton label="Easy" quality={5} color={colors.success} onPress={() => rateAndAdvance(5)} />
            </Animated.View>
          ) : (
            <Text style={[styles.flipHint, { color: colors.muted }]}>Flip the card to rate your recall</Text>
          )}

          <View style={styles.navRow}>
            <NavButton
              label="Prev"
              disabled={idx === 0}
              onPress={() => {
                void hapticImpact("light");
                setIdx((i) => Math.max(0, i - 1));
                setFlipped(false);
              }}
              colors={colors}
            />
            <NavButton
              label="Next"
              disabled={idx >= total - 1}
              onPress={() => {
                void hapticImpact("light");
                setIdx((i) => Math.min(total - 1, i + 1));
                setFlipped(false);
              }}
              colors={colors}
            />
          </View>
        </>
      )}
    </Screen>
  );
}

function TabButton({
  label,
  active,
  onPress,
  colors,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  colors: { primary: string; text: string; muted: string; border: string };
}) {
  return (
    <Pressable
      style={[styles.tabBtn, active && { borderBottomColor: colors.primary }]}
      onPress={() => {
        void hapticImpact("light");
        onPress();
      }}
    >
      <Text style={[styles.tabBtnText, { color: active ? colors.primary : colors.muted }]}>{label}</Text>
    </Pressable>
  );
}

function RatingButton({
  label,
  quality,
  color,
  onPress,
}: {
  label: string;
  quality: number;
  color: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.rateBtn, { backgroundColor: color }]}
      onPress={() => {
        void hapticImpact("light");
        onPress();
      }}
    >
      <Text style={styles.rateBtnText}>{label}</Text>
      <Text style={styles.rateQuality}>{quality}</Text>
    </Pressable>
  );
}

function NavButton({
  label,
  disabled,
  onPress,
  colors,
}: {
  label: string;
  disabled: boolean;
  onPress: () => void;
  colors: { surface: string; text: string; muted: string };
}) {
  return (
    <Pressable
      style={[styles.navBtn, { backgroundColor: colors.surface }, disabled && styles.disabled]}
      disabled={disabled}
      onPress={onPress}
    >
      <Text style={[styles.navBtnText, { color: colors.text }]}>{label}</Text>
    </Pressable>
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
  tabRow: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
  tabBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabBtnText: { fontSize: 14, fontWeight: "700" },
  tabScroll: { paddingHorizontal: 16, paddingBottom: 32 },
  iconBtn: {
    minWidth: 44,
    minHeight: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  offlineBanner: {
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 10,
    borderRadius: 10,
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
  },
  progressTrack: {
    height: 4,
    marginHorizontal: 16,
    borderRadius: 4,
    overflow: "hidden",
    marginBottom: 12,
  },
  progressFill: { height: 4, borderRadius: 4 },
  cardArea: { flex: 1, paddingHorizontal: 16, justifyContent: "center" },
  flipHint: { textAlign: "center", fontSize: 14, marginBottom: 12, paddingHorizontal: 16 },
  ratingRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  rateBtn: {
    minHeight: 44,
    minWidth: 72,
    borderRadius: 12,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  rateBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  rateQuality: { color: "rgba(255,255,255,0.85)", fontSize: 11, marginTop: 2 },
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
  disabled: { opacity: 0.35 },
});
