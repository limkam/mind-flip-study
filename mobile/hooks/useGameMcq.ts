import { useMemo, useState } from "react";

import { buildMcq, type QuizDifficultyMode } from "../lib/gameUtils";

export function useGameMcq(
  cards: Parameters<typeof buildMcq>[0],
  count: number,
  generationSeed = 0,
  optionsCount = 4,
) {
  const [mode, setMode] = useState<QuizDifficultyMode>("mixed");
  const questions = useMemo(
    () => buildMcq(cards, count, optionsCount, generationSeed, mode),
    [cards, count, optionsCount, generationSeed, mode],
  );
  return { mode, setMode, questions };
}
