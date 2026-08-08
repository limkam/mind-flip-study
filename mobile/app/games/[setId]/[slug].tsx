import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";

import { EmptyState } from "../../../components/EmptyState";
import { GAME_COMPONENTS, GAMES } from "../../../components/games";
import { GameShell } from "../../../components/games/GameShell";
import { StudySkeleton } from "../../../components/skeletons/StudySkeleton";
import { api } from "../../../api/client";
import { cacheStudySet, getCachedStudySet } from "../../../lib/offlineStudy";
import { MIN_GAME_CARDS, toGameCards } from "../../../lib/gameUtils";
import { logGameEvent } from "../../../lib/gameLifecycle";
import { getSaveErrorCategory, logStudyEvent, STUDY_EVENTS } from "../../../lib/studyEvents";
import { submitQuizResult } from "../../../lib/quizResults";
import { invalidateAfterQuizResult } from "../../../lib/quizResultInvalidation";
import { useAuthStore } from "../../../store/authStore";
import { useCelebration } from "../../../context/CelebrationContext";
import type { GameSlug } from "../../../components/games/types";
import type { GameRoundResult } from "../../../components/games/types";
import type { FlashcardSetOut, QuizResultInput } from "../../../types/api";
import { fetchEntitlementsSnapshot } from "../../../lib/billing";

export default function GamePlayScreen() {
  const { setId, slug } = useLocalSearchParams<{ setId: string; slug: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const userId = useAuthStore((state) => state.user?.id);
  const { requestMany: requestCelebrations } = useCelebration();
  const gameSlug = slug as GameSlug;
  const meta = GAMES.find((g) => g.slug === gameSlug);
  const GameComponent = GAME_COMPONENTS[gameSlug];
  const startedAt = useRef(Date.now());
  const submissionInFlight = useRef(false);
  const submittedResultId = useRef<string | null>(null);
  const routeGeneration = useRef(0);
  const [pendingResult, setPendingResult] = useState<GameRoundResult | null>(null);
  const [saveError, setSaveError] = useState<{ message: string; retryable: boolean } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [navigationError, setNavigationError] = useState(false);

  useEffect(() => {
    routeGeneration.current += 1;
    startedAt.current = Date.now();
    submissionInFlight.current = false;
    submittedResultId.current = null;
    setPendingResult(null);
    setSaveError(null);
    setIsSaving(false);
    setNavigationError(false);
    return () => {
      routeGeneration.current += 1;
    };
  }, [gameSlug, setId]);

  const { data: entitlements, isLoading: entitlementsLoading } = useQuery({
    queryKey: ["billing-entitlements"],
    queryFn: fetchEntitlementsSnapshot,
  });
  const gameLimit = entitlements?.features?.games_limit ?? 2;
  const gameIndex = GAMES.findIndex((game) => game.slug === gameSlug);
  const isLocked = gameIndex >= gameLimit;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["game-set", setId, "play"],
    enabled: !!setId,
    queryFn: async () => {
      try {
        const { data: set } = await api.get<FlashcardSetOut>(`/flashcard-sets/${setId}`);
        cacheStudySet(set);
        return set;
      } catch {
        const cached = getCachedStudySet(setId as string);
        if (!cached) throw new Error("offline");
        return {
          id: cached.id,
          user_id: "",
          tags: [],
          title: cached.title,
          book_title: cached.book_title,
          card_count: cached.cards.length,
          book_id: null,
          cards: cached.cards,
        } satisfies FlashcardSetOut;
      }
    },
  });

  if (!meta || !GameComponent) {
    return (
      <GameShell title="Unknown game" onBack={() => router.back()}>
        <EmptyState
          icon="🎮"
          title="Game not found"
          message="This game mode is not available."
          actionLabel="Go back"
          onAction={() => router.back()}
        />
      </GameShell>
    );
  }

  const cards = toGameCards(data?.cards ?? []);

  // Emit game_start once per mounted game instance when set and cards are ready
  const startEmittedRef = useRef<string | null>(null);
  useEffect(() => {
    const resolvedSetId = Array.isArray(setId) ? setId[0] : setId;
    if (!resolvedSetId || !data || !userId || cards.length < MIN_GAME_CARDS) return;

    const instanceKey = `${userId}:${resolvedSetId}:${gameSlug}:${startedAt.current}`;
    if (startEmittedRef.current === instanceKey) return;
    startEmittedRef.current = instanceKey;

    void logStudyEvent({
      eventType: STUDY_EVENTS.GAME_START,
      setId: resolvedSetId,
      metadata: {
        game_type: gameSlug,
        mode: "game",
      },
    });
  }, [data, gameSlug, setId, userId, cards.length]);

  const persistCompletion = useCallback(async (result: GameRoundResult) => {
    const resolvedSetId = Array.isArray(setId) ? setId[0] : setId;
    if (!resolvedSetId || !data || !userId || submissionInFlight.current || submittedResultId.current) return;

    submissionInFlight.current = true;
    const generation = routeGeneration.current;
    setPendingResult(result);
    setSaveError(null);
    setIsSaving(true);
    const totalQuestions = Math.max(Math.trunc(result.totalRounds || 0), 1);
    const score = Math.max(Math.trunc(result.playerScore || 0), 0);
    const percentage = result.percentage ?? Math.round((score / totalQuestions) * 100);
    const elapsedSeconds = Math.max(0, Math.round((Date.now() - startedAt.current) / 1000));
    const input: QuizResultInput = {
      set_id: resolvedSetId,
      score,
      total_questions: totalQuestions,
      time_taken_seconds: Math.max(Math.trunc(result.timeTakenSeconds ?? elapsedSeconds), 0),
      extras: {
        set_title: data.title,
        book_title: data.book_title,
        percentage,
        game_type: gameSlug,
        mode: "game",
      },
    };

    const submission = await submitQuizResult(input);
    if (generation !== routeGeneration.current) return;
    setIsSaving(false);
    if (submission.status !== "submitted") {
      submissionInFlight.current = false;
      setSaveError({
        message: submission.reason,
        retryable: submission.status === "rejected" && submission.retryable,
      });

      // Perform stale identity check and verify request was actually dispatched over HTTP
      const currentUserId = useAuthStore.getState().user?.id;
      if (currentUserId !== userId) return;

      const isDispatchedFailure = submission.requestDispatched === true
        && (submission.status === "rejected"
          || (submission.status === "authentication" && submission.httpStatus === 401));

      if (isDispatchedFailure) {
        const errorCategory = submission.status === "rejected"
          ? submission.errorCategory
          : "unauthorized";

        void logStudyEvent({
          eventType: STUDY_EVENTS.GAME_SAVE_ERROR,
          setId: resolvedSetId,
          metadata: {
            game_type: gameSlug,
            mode: "game",
            error_category: errorCategory,
          },
        });
      }
      return;
    }

    submittedResultId.current = submission.result.id;
    if (useAuthStore.getState().user?.id !== userId) return;

    // Telemetry emission upon authoritative persistence success
    void logStudyEvent({
      eventType: STUDY_EVENTS.GAME_FINISH,
      setId: resolvedSetId,
      metadata: {
        game_type: gameSlug,
        mode: "game",
        result_id: submission.result.id,
        percentage: submission.result.percentage ?? percentage,
        duration_seconds: submission.result.time_taken_seconds,
      },
    });

    void requestCelebrations(submission.result, {
      destination: {
        type: "quiz-result",
        resultId: submission.result.id,
      },
    });

    await invalidateAfterQuizResult(queryClient, userId, submission.result);
    try {
      router.replace(`/quiz-results/${submission.result.id}`);
    } catch {
      setNavigationError(true);
    }
  }, [data, gameSlug, queryClient, requestCelebrations, router, setId, userId]);

  return (
    <GameShell
      title={`${meta.emoji} ${meta.title}`}
      subtitle={data?.title}
      onBack={() => router.replace(`/games/${setId}`)}
    >
      <Stack.Screen options={{ title: meta.title, headerShown: false }} />
      {isLoading || entitlementsLoading ? (
        <StudySkeleton />
      ) : isLocked ? (
        <EmptyState
          icon="🔒"
          title="Game locked"
          message={`Your current plan includes ${gameLimit} of 8 games. Upgrade to unlock this game.`}
          actionLabel="View games"
          onAction={() => router.replace(`/games/${setId}`)}
        />
      ) : isError ? (
        <EmptyState
          icon="⚠️"
          title="Could not load cards"
          message="Try again when you are back online."
          actionLabel="Retry"
          onAction={() => refetch()}
        />
      ) : navigationError && submittedResultId.current ? (
        <EmptyState
          icon="✅"
          title="Result saved"
          message="Your score was saved, but the results couldn't be opened."
          actionLabel="Open saved result"
          onAction={() => {
            const resolvedSetId = Array.isArray(setId) ? setId[0] : setId;
            void logStudyEvent({
              eventType: STUDY_EVENTS.GAME_CONTINUE,
              setId: typeof resolvedSetId === "string" ? resolvedSetId : undefined,
              metadata: {
                game_type: gameSlug,
                result_id: submittedResultId.current,
              },
            });
            try {
              router.replace(`/quiz-results/${submittedResultId.current}`);
            } catch {
              setNavigationError(true);
            }
          }}
        />
      ) : saveError && pendingResult ? (
        <EmptyState
          icon="⚠️"
          title="Result not saved"
          message={saveError.message}
          actionLabel={saveError.retryable ? "Retry saving" : "Back to games"}
          onAction={() => {
            if (saveError.retryable) void persistCompletion(pendingResult);
            else router.replace(`/games/${setId}`);
          }}
        />
      ) : isSaving ? (
        <EmptyState
          icon="☁️"
          title="Saving your result"
          message="Please wait while your score is confirmed."
        />
      ) : cards.length < MIN_GAME_CARDS ? (
        <EmptyState
          icon="🎮"
          title="Not enough cards"
          message={`Need at least ${MIN_GAME_CARDS} cards to play.`}
          actionLabel="Back"
          onAction={() => router.back()}
        />
      ) : (
        <GameComponent
          cards={cards}
          generationSeed={data?.generation_seed ?? 0}
          onComplete={(result) => void persistCompletion(result)}
        />
      )}
    </GameShell>
  );
}
