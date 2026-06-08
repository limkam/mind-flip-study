import React, { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import client from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { motion, AnimatePresence } from "framer-motion";
import { Brain, CheckCircle, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import FlashCard from "@/components/study/FlashCard";
import SpacedRepetitionBar from "@/components/study/SpacedRepetitionBar";

const RATING_TO_QUALITY = { hard: 2, medium: 3, easy: 5 };

function sortDueRows(rows) {
  return [...rows].sort((a, b) => {
    const da = a.next_review_date ? String(a.next_review_date) : "";
    const db = b.next_review_date ? String(b.next_review_date) : "";
    if (!da && !db) return 0;
    if (!da) return -1;
    if (!db) return 1;
    return da.localeCompare(db);
  });
}

export default function DailyReview() {
  const { user } = useAuth();
  const [currentIdx, setCurrentIdx] = useState(0);
  const [direction, setDirection] = useState(1);
  const [sessionDone, setSessionDone] = useState(false);
  const [lastRated, setLastRated] = useState(null);
  const queryClient = useQueryClient();

  const { data: reviewItems = [], isLoading } = useQuery({
    queryKey: ["daily-review-queue", user?.id],
    enabled: !!user,
    queryFn: async () => {
      // TODO: replace N-per-set calls with a single aggregated GET /study/due-cards when available.
      const { data: sets } = await client.get("/flashcard-sets/", { params: { include_cards: false } });
      const list = sets || [];
      const pages = await Promise.all(
        list.map((s) =>
          client
            .get("/study/due-cards", { params: { set_id: s.id, limit: 20 } })
            .then((r) => r.data)
            .catch(() => []),
        ),
      );
      const merged = pages.flat();
      const sorted = sortDueRows(merged);
      return sorted.map((row) => ({
        card: {
          id: row.id,
          set_id: row.set_id,
          front: row.front,
          back: row.back,
          created_at: row.created_at,
        },
        setTitle: row.set_title,
        progress: {
          card_id: row.id,
          ease_factor: row.ease_factor ?? 2.5,
          interval_days: row.interval_days ?? 1,
          next_review_date: row.next_review_date,
          repetitions: row.repetitions ?? 0,
        },
      }));
    },
  });

  const count = reviewItems.length;

  useEffect(() => {
    setLastRated(null);
  }, [currentIdx]);

  const handleRate = async (rating) => {
    const item = reviewItems[currentIdx];
    if (!item) return;
    const quality = RATING_TO_QUALITY[rating];
    if (quality == null) return;
    await client.post("/study/progress", {
      card_id: item.card.id,
      quality,
    });
    setLastRated(rating);
    await queryClient.invalidateQueries({ queryKey: ["daily-review-queue"] });
    if (currentIdx >= count - 1) {
      setSessionDone(true);
    } else {
      setDirection(1);
      setCurrentIdx((i) => i + 1);
    }
  };

  const item = reviewItems[currentIdx];

  const progressForBar = useMemo(() => {
    if (!item) return null;
    return { ...item.progress, rating: lastRated };
  }, [item, lastRated]);

  if (!user) return null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (count === 0) {
    return (
      <div className="max-w-xl mx-auto text-center py-20">
        <Brain className="w-14 h-14 mx-auto text-muted-foreground/30 mb-4" />
        <h1 className="font-heading text-2xl font-bold mb-2">Nothing due today</h1>
        <p className="text-muted-foreground">You have no flashcards scheduled for review.</p>
      </div>
    );
  }

  if (sessionDone) {
    return (
      <div className="max-w-xl mx-auto text-center py-20">
        <CheckCircle className="w-16 h-16 mx-auto text-emerald-500 mb-4" />
        <h1 className="font-heading text-2xl font-bold mb-2">Session complete</h1>
        <p className="text-muted-foreground">Nice work — see you tomorrow.</p>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto">
      <div className="flex items-center gap-2 mb-6 text-muted-foreground">
        <Brain className="w-5 h-5 text-primary" />
        <span className="text-sm font-medium">Daily review</span>
        <span className="text-xs ml-auto">{currentIdx + 1} / {count}</span>
      </div>

      <div className="flex flex-col items-center gap-8">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={currentIdx}
            custom={direction}
            initial={{ x: direction * 80, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: direction * -80, opacity: 0 }}
            className="w-full"
          >
            <p className="text-xs text-muted-foreground text-center mb-2">{item.setTitle}</p>
            <FlashCard front={item.card.front} back={item.card.back} />
          </motion.div>
        </AnimatePresence>

        <div className="flex items-center gap-4 w-full justify-between">
          <Button variant="outline" size="icon" disabled={currentIdx === 0} onClick={() => { setDirection(-1); setCurrentIdx((i) => Math.max(0, i - 1)); }}>
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1 max-w-md">
            <SpacedRepetitionBar onRate={handleRate} cardProgress={progressForBar} />
          </div>
          <Button variant="outline" size="icon" disabled={currentIdx === count - 1} onClick={() => { setDirection(1); setCurrentIdx((i) => Math.min(count - 1, i + 1)); }}>
            <ChevronRight className="w-5 h-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
