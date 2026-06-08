export type GameCard = {
  id: string;
  front: string;
  back: string;
  chapter?: string | null;
  difficulty?: string | null;
};

export type McqQuestion = {
  question: string;
  correct: string;
  options: string[];
};

export type GameRoundResult = {
  playerScore: number;
  computerScore: number;
  totalRounds: number;
};

export type GameProps = {
  cards: GameCard[];
  onComplete: (result: GameRoundResult) => void;
};

export const GAME_SLUGS = [
  "quiz",
  "lightning",
  "battle",
  "memory",
  "hangman",
  "tugofwar",
  "bricks",
  "scramble",
] as const;

export type GameSlug = (typeof GAME_SLUGS)[number];

export type GameMeta = {
  slug: GameSlug;
  emoji: string;
  title: string;
  description: string;
  badge: string;
};

export const GAMES: GameMeta[] = [
  {
    slug: "quiz",
    emoji: "❓",
    title: "Classic Quiz",
    description: "Multiple choice with streak bonuses.",
    badge: "Classic",
  },
  {
    slug: "lightning",
    emoji: "⚡",
    title: "Lightning Round",
    description: "60 seconds, 2 choices per question.",
    badge: "Speed",
  },
  {
    slug: "battle",
    emoji: "⚔️",
    title: "Battle RPG",
    description: "Answer correctly to attack enemies.",
    badge: "RPG",
  },
  {
    slug: "memory",
    emoji: "🃏",
    title: "Memory Match",
    description: "Match questions with answers.",
    badge: "Memory",
  },
  {
    slug: "hangman",
    emoji: "🎯",
    title: "Hangman",
    description: "Guess the answer letter by letter.",
    badge: "Survival",
  },
  {
    slug: "tugofwar",
    emoji: "🪢",
    title: "Tug of War",
    description: "Pull the rope with correct answers.",
    badge: "Action",
  },
  {
    slug: "bricks",
    emoji: "🧱",
    title: "Brick Breaker",
    description: "Answer correctly to smash bricks.",
    badge: "Arcade",
  },
  {
    slug: "scramble",
    emoji: "🔤",
    title: "Word Scramble",
    description: "Unscramble answers before the computer.",
    badge: "Words",
  },
];
