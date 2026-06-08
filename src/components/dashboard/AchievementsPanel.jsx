import React, { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import client from "@/api/client";
import { motion } from "framer-motion";
import { Trophy } from "lucide-react";

const ALL_ACHIEVEMENTS = [
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

export default function AchievementsPanel({
  user,
  quizResults = [],
  quizCount: quizCountProp,
  hasPerfectQuiz,
  flashcardSets = [],
  streak = 0,
  challenges = [],
}) {
  const queryClient = useQueryClient();

  const totalCards = flashcardSets.reduce(
    (sum, s) => sum + (s.cards?.length ?? s.card_count ?? 0),
    0,
  );
  const challengesSent = challenges.filter((c) => c.challenger_email === user?.email).length;

  const stats = useMemo(
    () => ({
      quizCount: quizCountProp ?? quizResults.length,
      hasPerfect:
        hasPerfectQuiz ??
        quizResults.some((r) => (r.percentage ?? r.extras?.percentage) === 100),
      streak,
      totalCards,
      challengesSent,
    }),
    [quizCountProp, quizResults, hasPerfectQuiz, streak, totalCards, challengesSent],
  );

  const { data: earned = [] } = useQuery({
    queryKey: ['achievements', user?.email],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data } = await client.get('/achievements/');
      return data;
    },
    enabled: !!user?.email,
  });

  const earnedIds = useMemo(() => new Set(earned.map((a) => a.achievement_type)), [earned]);

  // Auto-award new achievements
  useEffect(() => {
    if (!user?.email) return;
    ALL_ACHIEVEMENTS.forEach(async (ach) => {
      if (!earnedIds.has(ach.id) && ach.check(stats)) {
        await client.post("/achievements/", {
          achievement_type: ach.id,
          metadata: { title: ach.title, description: ach.description, icon: ach.icon },
        });
        queryClient.invalidateQueries({ queryKey: ["achievements", user.email] });
      }
    });
  }, [user?.email, earned, queryClient, stats]);

  const unlocked = ALL_ACHIEVEMENTS.filter(a => earnedIds.has(a.id));
  const locked = ALL_ACHIEVEMENTS.filter(a => !earnedIds.has(a.id));

  return (
    <div className="bg-card rounded-2xl border border-border p-6">
      <div className="flex items-center gap-3 mb-5">
        <Trophy className="w-5 h-5 text-yellow-500" />
        <h2 className="font-heading text-xl font-semibold">Achievements</h2>
        <span className="ml-auto text-sm font-medium text-muted-foreground">
          {unlocked.length} / {ALL_ACHIEVEMENTS.length}
        </span>
      </div>

      {unlocked.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
          {unlocked.map((ach, i) => (
            <motion.div
              key={ach.id}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.05 }}
              className="flex flex-col items-center gap-1 bg-gradient-to-br from-yellow-500/10 to-amber-500/5 border border-yellow-400/20 rounded-xl p-3 text-center"
            >
              <span className="text-2xl">{ach.icon}</span>
              <p className="text-xs font-semibold leading-tight">{ach.title}</p>
              <p className="text-[10px] text-muted-foreground leading-tight">{ach.description}</p>
            </motion.div>
          ))}
        </div>
      )}

      {locked.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Locked</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {locked.map(ach => (
              <div key={ach.id} className="flex flex-col items-center gap-1 bg-muted/40 border border-border rounded-xl p-3 text-center opacity-50 grayscale">
                <span className="text-2xl">{ach.icon}</span>
                <p className="text-xs font-semibold leading-tight">{ach.title}</p>
                <p className="text-[10px] text-muted-foreground leading-tight">{ach.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}