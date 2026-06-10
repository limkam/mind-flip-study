/** Shared quiz/game helpers — seeded shuffle and difficulty-aware MCQ building. */

export const QUIZ_DIFFICULTY_MODES = ['mixed', 'easy', 'medium', 'hard'];

function hashSeed(seed) {
  let h = 2166136261;
  const s = String(seed);
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(a) {
  return function next() {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededShuffle(seed, items, salt = '') {
  const rng = mulberry32(hashSeed(`${seed}|${salt}`));
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function filterCardsByDifficulty(cards, mode = 'mixed') {
  if (!mode || mode === 'mixed') return cards;
  const filtered = cards.filter((c) => (c.difficulty || 'medium') === mode);
  return filtered.length >= 4 ? filtered : cards;
}

export function selectQuizCards(cards, count = 20, seed = 0, mode = 'mixed') {
  const pool = filterCardsByDifficulty(cards, mode);
  const shuffled = seededShuffle(seed, pool, `quiz-${mode}`);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

export function buildMcqQuestions(cards, { count = 20, optionsCount = 4, seed = 0, mode = 'mixed' } = {}) {
  const selected = selectQuizCards(cards, count, seed, mode);
  const all = cards;

  return selected.map((card, idx) => {
    const wrongPool = seededShuffle(seed, all.filter((c) => c.back !== card.back), `wrong-${idx}-${card.id}`);
    const wrong = wrongPool.slice(0, optionsCount - 1).map((c) => c.back);
    while (wrong.length < optionsCount - 1) wrong.push('None of the above');
    const options = seededShuffle(seed, [card.back, ...wrong], `opts-${idx}`);
    return {
      question: card.front,
      correctAnswer: card.back,
      options,
      chapter: card.chapter,
      difficulty: card.difficulty || 'medium',
      cognitiveLevel: card.cognitive_level,
    };
  });
}

export function selectGameCards(cards, count, seed = 0, performanceScore = 0.5) {
  // Adaptive: lower performance → easier cards; higher → harder
  const target =
    performanceScore >= 0.75 ? 'hard' : performanceScore <= 0.4 ? 'easy' : 'medium';
  let pool = cards;
  if (target !== 'medium') {
    const filtered = cards.filter((c) => (c.difficulty || 'medium') === target);
    if (filtered.length >= Math.min(count, 4)) pool = filtered;
  }
  return seededShuffle(seed, pool, `game-${target}`).slice(0, count);
}

export function difficultyLabel(mode) {
  return { mixed: 'Mixed', easy: 'Easy', medium: 'Medium', hard: 'Hard' }[mode] || 'Mixed';
}
