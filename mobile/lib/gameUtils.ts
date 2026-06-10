import type { FlashcardOut } from "../types/api";
import type { GameCard, McqQuestion } from "../components/games/types";

export const MIN_GAME_CARDS = 4;

export type QuizDifficultyMode = "mixed" | "easy" | "medium" | "hard";

export const QUIZ_DIFFICULTY_MODES: QuizDifficultyMode[] = ["mixed", "easy", "medium", "hard"];

export function difficultyLabel(mode: QuizDifficultyMode): string {
  return { mixed: "Mixed", easy: "Easy", medium: "Medium", hard: "Hard" }[mode];
}

function hashSeed(seed: number | string, salt = ""): number {
  let h = 2166136261;
  const s = `${seed}|${salt}`;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(a: number) {
  return () => {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededShuffle<T>(seed: number | string, arr: T[], salt = ""): T[] {
  const rng = mulberry32(hashSeed(seed, salt));
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** @deprecated use seededShuffle */
export function shuffle<T>(arr: T[]): T[] {
  return seededShuffle(Date.now(), arr);
}

export function toGameCards(cards: FlashcardOut[]): GameCard[] {
  return cards.map((c) => ({
    id: c.id,
    front: c.front,
    back: c.back,
    chapter: c.chapter ?? null,
    difficulty: c.difficulty ?? null,
    cognitive_level: c.cognitive_level ?? null,
  }));
}

export function filterCardsByDifficulty(cards: GameCard[], mode: QuizDifficultyMode = "mixed"): GameCard[] {
  if (mode === "mixed") return cards;
  const filtered = cards.filter((c) => (c.difficulty || "medium") === mode);
  return filtered.length >= MIN_GAME_CARDS ? filtered : cards;
}

export function selectGameCardsByMode(
  cards: GameCard[],
  count: number,
  seed: number | string = 0,
  mode: QuizDifficultyMode = "mixed",
  salt = "game",
): GameCard[] {
  const pool = filterCardsByDifficulty(cards, mode);
  return seededShuffle(seed, pool, `${salt}-${mode}`).slice(0, Math.min(count, pool.length));
}

export function selectGameCards(
  cards: GameCard[],
  count: number,
  seed: number | string = 0,
  performanceScore = 0.5,
): GameCard[] {
  const target = performanceScore >= 0.75 ? "hard" : performanceScore <= 0.4 ? "easy" : "medium";
  let pool = cards;
  if (target !== "medium") {
    const filtered = cards.filter((c) => (c.difficulty || "medium") === target);
    if (filtered.length >= Math.min(count, MIN_GAME_CARDS)) pool = filtered;
  }
  return seededShuffle(seed, pool, `game-${target}`).slice(0, count);
}

export function normalizeAnswer(raw: string, maxLen = 25): string {
  const ans = raw.split(".")[0].split(",")[0].trim().toUpperCase();
  return ans.length > maxLen ? ans.slice(0, maxLen) : ans;
}

export function buildMcq(
  cards: GameCard[],
  count = 10,
  optionsCount = 4,
  seed: number | string = 0,
  mode: QuizDifficultyMode = "mixed",
): McqQuestion[] {
  const pool = filterCardsByDifficulty(cards, mode);
  const selected = seededShuffle(seed, pool, `quiz-${mode}`).slice(0, count);
  return selected.map((card, idx) => {
    const wrong = seededShuffle(seed, cards.filter((c) => c.back !== card.back), `wrong-${idx}`)
      .slice(0, optionsCount - 1)
      .map((c) => c.back);
    while (wrong.length < optionsCount - 1) wrong.push("None of the above");
    return {
      question: card.front,
      correct: card.back,
      options: seededShuffle(seed, [card.back, ...wrong], `opts-${idx}`),
      difficulty: card.difficulty ?? "medium",
      chapter: card.chapter ?? null,
    };
  });
}

export function formatMmSs(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
