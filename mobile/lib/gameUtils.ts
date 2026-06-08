import type { FlashcardOut } from "../types/api";
import type { GameCard, McqQuestion } from "../components/games/types";

export const MIN_GAME_CARDS = 4;

export function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function toGameCards(cards: FlashcardOut[]): GameCard[] {
  return cards.map((c) => ({
    id: c.id,
    front: c.front,
    back: c.back,
    chapter: c.chapter ?? null,
    difficulty: c.difficulty ?? null,
  }));
}

export function normalizeAnswer(raw: string, maxLen = 25): string {
  const ans = raw.split(".")[0].split(",")[0].trim().toUpperCase();
  return ans.length > maxLen ? ans.slice(0, maxLen) : ans;
}

export function buildMcq(
  cards: GameCard[],
  count = 10,
  optionsCount = 4,
): McqQuestion[] {
  const pool = shuffle(cards).slice(0, count);
  return pool.map((card) => {
    const wrong = shuffle(cards.filter((c) => c.back !== card.back))
      .slice(0, optionsCount - 1)
      .map((c) => c.back);
    while (wrong.length < optionsCount - 1) wrong.push("None of the above");
    return {
      question: card.front,
      correct: card.back,
      options: shuffle([card.back, ...wrong]),
    };
  });
}

export function formatMmSs(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
