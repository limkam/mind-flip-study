import { useMemo, useState } from "react";

import type { GameCard } from "../components/games/types";
import { selectGameCardsByMode, type QuizDifficultyMode } from "../lib/gameUtils";

export function useGameCardPool(
  cards: GameCard[],
  count: number,
  generationSeed = 0,
  salt = "game",
) {
  const [mode, setMode] = useState<QuizDifficultyMode>("mixed");
  const pool = useMemo(
    () => selectGameCardsByMode(cards, count, generationSeed, mode, salt),
    [cards, count, generationSeed, mode, salt],
  );
  return { mode, setMode, pool };
}
