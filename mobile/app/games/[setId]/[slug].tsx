import { useQuery } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Alert } from "react-native";

import { EmptyState } from "../../../components/EmptyState";
import { GAME_COMPONENTS, GAMES } from "../../../components/games";
import { GameShell } from "../../../components/games/GameShell";
import { StudySkeleton } from "../../../components/skeletons/StudySkeleton";
import { api } from "../../../api/client";
import { cacheStudySet, getCachedStudySet } from "../../../lib/offlineStudy";
import { MIN_GAME_CARDS, toGameCards } from "../../../lib/gameUtils";
import type { GameSlug } from "../../../components/games/types";
import type { FlashcardSetOut } from "../../../types/api";

export default function GamePlayScreen() {
  const { setId, slug } = useLocalSearchParams<{ setId: string; slug: string }>();
  const router = useRouter();
  const gameSlug = slug as GameSlug;
  const meta = GAMES.find((g) => g.slug === gameSlug);
  const GameComponent = GAME_COMPONENTS[gameSlug];

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

  return (
    <GameShell
      title={`${meta.emoji} ${meta.title}`}
      subtitle={data?.title}
      onBack={() => router.replace(`/games/${setId}`)}
    >
      <Stack.Screen options={{ title: meta.title, headerShown: false }} />
      {isLoading ? (
        <StudySkeleton />
      ) : isError ? (
        <EmptyState
          icon="⚠️"
          title="Could not load cards"
          message="Try again when you are back online."
          actionLabel="Retry"
          onAction={() => refetch()}
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
          onComplete={(result) => {
            Alert.alert(
              "Round complete",
              `Score: ${result.playerScore} (you) vs ${result.computerScore}`,
              [{ text: "Done", onPress: () => router.replace(`/games/${setId}`) }],
            );
          }}
        />
      )}
    </GameShell>
  );
}
