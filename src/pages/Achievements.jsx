import React, { useMemo } from "react";
import { useOutletContext } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import client from "@/api/client";
import { motion } from "framer-motion";
import AchievementsPanel from "@/components/dashboard/AchievementsPanel";
import { fetchAllBooksPages } from "@/lib/fetchAllBooksPages";

export default function Achievements() {
  const { user } = useOutletContext();

  const { data: books = [] } = useQuery({
    queryKey: ["books"],
    queryFn: () => fetchAllBooksPages(),
  });

  const { data: flashcardSets = [] } = useQuery({
    queryKey: ["flashcard-sets"],
    queryFn: async () => {
      const { data } = await client.get("/flashcard-sets/", { params: { include_cards: false } });
      return data;
    },
  });

  const { data: summary } = useQuery({
    queryKey: ["analytics-summary"],
    queryFn: async () => {
      const { data } = await client.get("/analytics/summary");
      return data;
    },
  });

  const stats = useMemo(() => ({
    quizCount: summary?.quiz_count ?? 0,
    streakDays: summary?.streak_days ?? 0,
    cardCount: flashcardSets.reduce((n, s) => n + (s.card_count || 0), 0),
    setCount: flashcardSets.length,
    bookCount: books.length,
    avgScore: summary?.avg_score ?? 0,
  }), [summary, flashcardSets, books]);

  return (
    <div className="max-w-3xl mx-auto">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <h1 className="font-heading text-3xl font-bold">Achievements</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Badges, XP, milestones, and challenge rewards
        </p>
      </motion.div>

      <AchievementsPanel stats={stats} userId={user?.id} />
    </div>
  );
}
