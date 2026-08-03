import type { QueryClient } from "@tanstack/react-query";

import { useAuthStore } from "../store/authStore";
import type { QuizResultOut } from "../types/api";

export async function invalidateAfterQuizResult(
  queryClient: QueryClient,
  expectedUserId: string,
  result: QuizResultOut,
): Promise<void> {
  if (useAuthStore.getState().user?.id !== expectedUserId) return;

  try {
    queryClient.setQueryData(["quiz-result", result.id], result);
  } catch {
    console.warn("[quizResultInvalidation] The saved result could not be added to the detail cache.");
  }
  const quizLeaderboardMetrics = new Set(["avg_score", "most_quizzes", "xp"]);
  const outcomes = await Promise.allSettled([
    queryClient.invalidateQueries({ queryKey: ["quiz-results"] }),
    queryClient.invalidateQueries({ queryKey: ["analytics-summary"] }),
    queryClient.invalidateQueries({ queryKey: ["analytics-me"] }),
    queryClient.invalidateQueries({ queryKey: ["scorecards"] }),
    queryClient.invalidateQueries({ queryKey: ["achievements"] }),
    queryClient.invalidateQueries({
      predicate: (query) => query.queryKey[0] === "leaderboard"
        && typeof query.queryKey[2] === "string"
        && quizLeaderboardMetrics.has(query.queryKey[2]),
    }),
  ]);
  if (outcomes.some((outcome) => outcome.status === "rejected")) {
    console.warn("[quizResultInvalidation] One or more dependent queries could not be invalidated.");
  }
}
