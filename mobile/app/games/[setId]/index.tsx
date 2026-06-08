import { useQuery } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";

import { ScrollView } from "react-native";

import { EmptyState } from "../../../components/EmptyState";
import { GameSelector } from "../../../components/games";
import { Screen } from "../../../components/Screen";
import { StudySkeleton } from "../../../components/skeletons/StudySkeleton";
import { api } from "../../../api/client";
import { cacheStudySet, getCachedStudySet } from "../../../lib/offlineStudy";
import { MIN_GAME_CARDS } from "../../../lib/gameUtils";
import type { FlashcardSetOut } from "../../../types/api";
import type { GameSlug } from "../../../components/games/types";

export default function GameHubScreen() {
  const { setId } = useLocalSearchParams<{ setId: string }>();
  const router = useRouter();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["game-set", setId],
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

  const cards = data?.cards ?? [];
  const title = data?.title ?? "Games";

  const openGame = (slug: GameSlug) => {
    router.push(`/games/${setId}/${slug}`);
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: `${title} · Games` }} />
      {isLoading ? (
        <StudySkeleton />
      ) : isError ? (
        <EmptyState
          icon="⚠️"
          title="Could not load set"
          message="Connect to the internet or study this set once while online."
          actionLabel="Retry"
          onAction={() => refetch()}
        />
      ) : cards.length < MIN_GAME_CARDS ? (
        <EmptyState
          icon="🎮"
          title="Not enough cards"
          message={`Games need at least ${MIN_GAME_CARDS} cards. This set has ${cards.length}.`}
          actionLabel="Back"
          onAction={() => router.back()}
        />
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }} showsVerticalScrollIndicator>
          <GameSelector onSelect={openGame} />
        </ScrollView>
      )}
    </Screen>
  );
}
