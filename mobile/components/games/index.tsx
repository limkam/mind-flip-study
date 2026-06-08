import type { ComponentType } from "react";

import { BattleRPGGame } from "./BattleRPGGame";
import { BricksGame } from "./BricksGame";
import { HangmanGame } from "./HangmanGame";
import { LightningRoundGame } from "./LightningRoundGame";
import { MemoryMatchGame } from "./MemoryMatchGame";
import { QuizGame } from "./QuizGame";
import { TugOfWarGame } from "./TugOfWarGame";
import { WordScrambleGame } from "./WordScrambleGame";
import type { GameProps, GameSlug } from "./types";

export const GAME_COMPONENTS: Record<GameSlug, ComponentType<GameProps>> = {
  quiz: QuizGame,
  lightning: LightningRoundGame,
  battle: BattleRPGGame,
  memory: MemoryMatchGame,
  hangman: HangmanGame,
  tugofwar: TugOfWarGame,
  bricks: BricksGame,
  scramble: WordScrambleGame,
};

export { GameSelector } from "./GameSelector";
export { GAMES, GAME_SLUGS } from "./types";
export type { GameCard, GameSlug, GameRoundResult } from "./types";
