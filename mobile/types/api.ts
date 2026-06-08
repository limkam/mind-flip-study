/** Shared list envelope from FastAPI (books, quiz-results, leaderboard). */
export type Paginated<T> = {
  items: T[];
  page: number;
  size: number;
  total: number;
  has_more: boolean;
  total_pages?: number;
};

export type WeakTopicOut = {
  set_id: string;
  title: string;
  avg_score: number;
};

export type ScoreTrendDayOut = {
  day: string;
  label: string;
  avg_score: number | null;
  quiz_count: number;
};

export type RatingBreakdownOut = {
  easy: number;
  medium: number;
  hard: number;
};

export type AnalyticsSummaryOut = {
  quiz_count: number;
  avg_score: number;
  streak_days: number;
  has_perfect_quiz?: boolean;
  weak_topics?: WeakTopicOut[];
  flashcard_sets_count?: number;
  cards_mastered_easy_band?: number;
  score_trend?: ScoreTrendDayOut[];
  rating_breakdown?: RatingBreakdownOut;
};

export type QuizResultOut = {
  id: string;
  set_id: string;
  score: number;
  total_questions: number;
  time_taken_seconds: number;
  percentage: number | null;
  set_title: string | null;
  book_title: string | null;
  completed_at: string;
};

export type LeaderboardItemOut = {
  rank: number;
  user_id: string;
  full_name: string;
  avatar_url: string | null;
  xp: number;
};

export type LeaderboardMeOut = {
  rank: number | null;
  xp: number;
};

export type FolderOut = {
  id: string;
  name: string;
  parent_id: string | null;
  description: string | null;
  color: string;
  icon: string;
  book_ids: string[];
  flashcard_set_ids: string[];
  created_at: string;
};

export type QuizChallengeOut = {
  id: string;
  flashcard_set_id: string;
  challenger_email: string;
  opponent_email: string;
  status: string;
  set_title?: string | null;
  book_title?: string | null;
  challenger_score?: number | null;
  opponent_score?: number | null;
};

export type BookOut = {
  id: string;
  title: string;
  author: string;
  status: string;
  file_size_bytes: number;
  created_at: string;
  subject?: string;
  tags?: unknown[];
  description?: string;
  table_of_contents?: { title?: string; chapter_number?: number; subtopics?: string[] }[];
};

export type FlashcardOut = {
  id: string;
  set_id: string;
  front: string;
  back: string;
  created_at: string;
  difficulty?: string | null;
  chapter?: string | null;
};

export type DueFlashcardOut = FlashcardOut & {
  set_title: string;
  ease_factor: number | null;
  interval_days: number | null;
  next_review_date: string | null;
  repetitions: number | null;
};

export type FlashcardSetOut = {
  id: string;
  title: string;
  card_count: number;
  book_title: string | null;
  book_id: string | null;
  cards: FlashcardOut[];
};

export type JobStatusResponse = {
  status: "pending" | "started" | "complete" | "failed";
  result?: unknown;
};
