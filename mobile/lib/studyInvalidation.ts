import type { QueryClient } from "@tanstack/react-query";

import { useAuthStore } from "../store/authStore";

type StudySessionCache = {
  cards?: unknown;
  allCards?: unknown;
};

function cachedStudyCardIds(data: unknown): string[] {
  if (!data || typeof data !== "object") return [];
  const cache = data as StudySessionCache;
  const rows = [cache.cards, cache.allCards]
    .filter((value): value is unknown[] => Array.isArray(value))
    .flat();
  return rows.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const id = (row as { id?: unknown }).id;
    return typeof id === "string" ? [id] : [];
  });
}

export type StudyProgressInvalidationContext = {
  expectedUserId: string;
  setIds?: Iterable<string>;
  cardIds?: Iterable<string>;
};

export async function invalidateAfterStudyProgress(
  queryClient: QueryClient,
  context: StudyProgressInvalidationContext,
): Promise<void> {
  if (useAuthStore.getState().user?.id !== context.expectedUserId) return;

  const setIds = new Set(context.setIds ?? []);
  const cardIds = new Set(context.cardIds ?? []);
  const invalidations: Array<Promise<unknown>> = [
    queryClient.invalidateQueries({ queryKey: ["scorecards"] }),
    queryClient.invalidateQueries({ queryKey: ["analytics-summary"] }),
    queryClient.invalidateQueries({ queryKey: ["analytics-me"] }),
    queryClient.invalidateQueries({ queryKey: ["daily-review-queue"] }),
  ];

  if (setIds.size || cardIds.size) {
    invalidations.push(queryClient.invalidateQueries({
      predicate: (query) => {
        if (query.queryKey[0] !== "study-session") return false;
        const setId = typeof query.queryKey[1] === "string" ? query.queryKey[1] : null;
        if (setId && setIds.has(setId)) return true;
        return cachedStudyCardIds(query.state.data).some((cardId) => cardIds.has(cardId));
      },
      refetchType: "none",
    }));
  }

  const outcomes = await Promise.allSettled(invalidations);
  if (outcomes.some((outcome) => outcome.status === "rejected")) {
    console.warn("[studyInvalidation] One or more dependent queries could not be invalidated.");
  }
}
