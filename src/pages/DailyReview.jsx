import React, { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import client from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { motion, AnimatePresence } from "framer-motion";
import { Brain, ChevronLeft, ChevronRight, Loader2, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import FlashCard from "@/components/study/FlashCard";
import SpacedRepetitionBar from "@/components/study/SpacedRepetitionBar";
import SessionSummary from "@/components/study/SessionSummary";
import { RatingOnboarding } from "@/components/study/RatingHelp";
import { studyThemeFromUser } from "@/lib/studyTheme";

const RATING_TO_QUALITY = { hard: 2, medium: 3, easy: 5 };

export default function DailyReview() {
  const { user } = useAuth();
  const studyThemeId = studyThemeFromUser(user).id;
  const [currentIdx, setCurrentIdx] = useState(0);
  const [direction, setDirection] = useState(1);
  const [sessionDone, setSessionDone] = useState(false);
  const [lastRated, setLastRated] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedBooks, setSelectedBooks] = useState({});
  const [hardOnly, setHardOnly] = useState(false);
  const [sessionStats, setSessionStats] = useState({ hard: 0, medium: 0, easy: 0, total: 0 });
  const sessionStart = useRef(Date.now());
  const queryClient = useQueryClient();

  const { data: books = [] } = useQuery({
    queryKey: ["books-daily-review"],
    queryFn: async () => {
      const { data } = await client.get("/books/", { params: { page: 1, size: 100 } });
      return data.items || [];
    },
    enabled: !!user,
  });

  const activeBookIds = useMemo(() => {
    const ids = Object.entries(selectedBooks).filter(([, v]) => v).map(([id]) => id);
    return ids.length > 0 ? ids : null;
  }, [selectedBooks]);

  const { data: reviewItems = [], isLoading } = useQuery({
    queryKey: ["daily-review-queue", user?.id, activeBookIds, hardOnly],
    enabled: !!user,
    queryFn: async () => {
      const params = { limit: 50 };
      if (activeBookIds?.length === 1) params.book_id = activeBookIds[0];

      const { data: rows } = await client.get("/study/daily-review", { params });

      let filtered = rows || [];
      if (activeBookIds?.length > 1) {
        const idSet = new Set(activeBookIds);
        filtered = filtered.filter((r) => idSet.has(String(r.book_id)));
      }

      return filtered.map((row) => ({
        card: {
          id: row.id,
          set_id: row.set_id,
          front: row.front,
          back: row.back,
          chapter: row.chapter,
          created_at: row.created_at,
        },
        setTitle: row.set_title,
        bookTitle: row.book_title,
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

  useEffect(() => {
    if (books.length && Object.keys(selectedBooks).length === 0) {
      const init = {};
      books.forEach((b) => { init[b.id] = true; });
      setSelectedBooks(init);
    }
  }, [books]);

  const handleRate = async (rating) => {
    const item = reviewItems[currentIdx];
    if (!item) return;
    const quality = RATING_TO_QUALITY[rating];
    if (quality == null) return;
    setLastRated(rating);
    setSessionStats((s) => ({
      ...s,
      total: s.total + 1,
      [rating]: (s[rating] || 0) + 1,
    }));
    try {
      await client.post("/study/progress", {
        card_id: item.card.id,
        quality,
      });
      await queryClient.invalidateQueries({ queryKey: ["daily-review-queue"] });
      if (currentIdx >= count - 1) {
        setSessionDone(true);
      } else {
        setDirection(1);
        setCurrentIdx((i) => i + 1);
      }
    } catch {
      setLastRated(null);
      setSessionStats((s) => ({
        ...s,
        total: Math.max(0, s.total - 1),
        [rating]: Math.max(0, (s[rating] || 0) - 1),
      }));
    }
  };

  const item = reviewItems[currentIdx];

  const progressForBar = useMemo(() => {
    if (!item) return null;
    return { ...item.progress, rating: lastRated };
  }, [item, lastRated]);

  const restartHardSession = () => {
    setHardOnly(true);
    setSessionDone(false);
    setCurrentIdx(0);
    setSessionStats({ hard: 0, medium: 0, easy: 0, total: 0 });
    sessionStart.current = Date.now();
  };

  if (!user) return null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (count === 0 && !hardOnly) {
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
      <SessionSummary
        stats={{
          ...sessionStats,
          durationMs: Date.now() - sessionStart.current,
        }}
        mode="study"
        onReviewHard={sessionStats.hard > 0 ? restartHardSession : null}
      />
    );
  }

  return (
    <div className="max-w-xl mx-auto">
      <div className="flex items-center gap-2 mb-4 text-muted-foreground">
        <Brain className="w-5 h-5 text-primary" />
        <span className="text-sm font-medium">Daily review</span>
        <Button variant="ghost" size="sm" className="ml-auto gap-1 text-xs" onClick={() => setShowFilters((v) => !v)}>
          <Filter className="w-3.5 h-3.5" /> Filter
        </Button>
        <span className="text-xs">{currentIdx + 1} / {count}</span>
      </div>

      {showFilters && (
        <div className="rounded-xl border border-border bg-card p-4 mb-4 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase">Review scope</p>
          {books.map((b) => (
            <label key={b.id} className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={!!selectedBooks[b.id]}
                onCheckedChange={(v) => setSelectedBooks((prev) => ({ ...prev, [b.id]: v }))}
              />
              {b.title}
            </label>
          ))}
        </div>
      )}

      <RatingOnboarding />

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
            <p className="text-xs text-muted-foreground text-center mb-1">{item?.setTitle}</p>
            {item?.card.chapter && (
              <p className="text-xs text-primary text-center mb-2 font-medium">{item.card.chapter}</p>
            )}
            <FlashCard front={item?.card.front} back={item?.card.back} themeId={studyThemeId} chapter={item?.card.chapter} />
          </motion.div>
        </AnimatePresence>

        <div className="flex items-center gap-4 w-full justify-between">
          <Button
            variant="outline"
            size="icon"
            disabled={currentIdx === 0}
            onClick={() => { setDirection(-1); setCurrentIdx((i) => Math.max(0, i - 1)); }}
          >
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1 max-w-md">
            <SpacedRepetitionBar
              onRate={handleRate}
              cardProgress={progressForBar}
              required
            />
          </div>
          <Button
            variant="outline"
            size="icon"
            disabled={currentIdx >= count - 1 || !lastRated}
            onClick={() => { setDirection(1); setCurrentIdx((i) => Math.min(count - 1, i + 1)); }}
          >
            <ChevronRight className="w-5 h-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
