/** Keep in sync with mobile `lib/achievements.ts`. */

export const ALL_ACHIEVEMENTS = [
  { id: "first_quiz", icon: "🎯", title: "First Quiz", description: "Complete your first quiz", check: (stats) => stats.quizCount >= 1 },
  { id: "quiz_5", icon: "🔥", title: "On a Roll", description: "Complete 5 quizzes", check: (stats) => stats.quizCount >= 5 },
  { id: "quiz_20", icon: "🏅", title: "Quiz Master", description: "Complete 20 quizzes", check: (stats) => stats.quizCount >= 20 },
  { id: "perfect_score", icon: "💯", title: "Perfect Score", description: "Score 100% on a quiz", check: (stats) => stats.hasPerfect },
  { id: "streak_3", icon: "⚡", title: "3-Day Streak", description: "Study 3 days in a row", check: (stats) => stats.streak >= 3 },
  { id: "streak_7", icon: "🔥", title: "Week Warrior", description: "Study 7 days in a row", check: (stats) => stats.streak >= 7 },
  { id: "streak_30", icon: "🏆", title: "Legend", description: "Study 30 days in a row", check: (stats) => stats.streak >= 30 },
  { id: "cards_100", icon: "📚", title: "Card Collector", description: "Create 100+ flashcards total", check: (stats) => stats.totalCards >= 100 },
  { id: "cards_500", icon: "🌟", title: "Knowledge Vault", description: "Create 500+ flashcards", check: (stats) => stats.totalCards >= 500 },
  { id: "first_challenge", icon: "⚔️", title: "Challenger", description: "Send your first quiz challenge", check: (stats) => stats.challengesSent >= 1 },
];
