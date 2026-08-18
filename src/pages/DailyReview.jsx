import React, { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import client from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { motion, AnimatePresence } from "framer-motion";
import { Brain, ChevronLeft, ChevronRight, Loader2, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import FlashCard from "@/components/study/FlashCard";
import SpacedRepetitionBar from "@/components/study/SpacedRepetitionBar";
import SessionSummary from "@/components/study/SessionSummary";
import { RatingOnboarding } from "@/components/study/RatingHelp";
import { studyThemeFromUser } from "@/lib/studyTheme";
import { useCelebration } from "@/lib/celebrations/CelebrationContext";
import { parseTrustedCelebrationEvents, refreshAchievementSurfaces } from "@/lib/celebrations/trustedEvents";
import { fetchAllBooksPages } from "@/lib/fetchAllBooksPages";

const RATING_TO_QUALITY = { hard: 2, medium: 3, easy: 5 };

function mapReviewRows(rows) {
  return (rows || []).map((row) => ({
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
    bookId: row.book_id ? String(row.book_id) : null,
    progress: {
      card_id: row.id,
      ease_factor: row.ease_factor ?? 2.5,
      interval_days: row.interval_days ?? 1,
      next_review_date: row.next_review_date,
      repetitions: row.repetitions ?? 0,
    },
  }));
}

export default function DailyReview() {
  const { user } = useAuth();
  const studyThemeId = studyThemeFromUser(user).id;
  const [currentIdx, setCurrentIdx] = useState(0);
  const [direction, setDirection] = useState(1);
  const [sessionDone, setSessionDone] = useState(false);
  const [lastRated, setLastRated] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedBooks, setSelectedBooks] = useState({});
  const [selectedChapters, setSelectedChapters] = useState({});
  const [hardOnly, setHardOnly] = useState(false);
  const [sessionStats, setSessionStats] = useState({ hard: 0, medium: 0, easy: 0, total: 0 });
  const sessionStart = useRef(Date.now());
  const queryClient = useQueryClient();
  const { requestMany } = useCelebration();

  const { data: books = [] } = useQuery({
    queryKey: ["books"],
    queryFn: fetchAllBooksPages,
    enabled: !!user,
  });

  const activeBookIds = useMemo(
    () => Object.entries(selectedBooks).filter(([, v]) => v).map(([id]) => id),
    [selectedBooks],
  );

  const booksInitialized = books.length > 0 && Object.keys(selectedBooks).length > 0;
  const reviewBookScope = !booksInitialized || activeBookIds.length === books.length
    ? "all"
    : activeBookIds;

  const {
    data: reviewItems = [],
    isPending,
    isFetching,
  } = useQuery({
    queryKey: ["daily-review-queue", user?.id, reviewBookScope, hardOnly],
    enabled: !!user && (!booksInitialized || activeBookIds.length > 0),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const params = { limit: 100 };
      if (reviewBookScope !== "all" && reviewBookScope.length === 1) {
        params.book_id = reviewBookScope[0];
      } else if (reviewBookScope !== "all" && reviewBookScope.length > 1) {
        params.book_ids = reviewBookScope;
      }

      const { data: rows } = await client.get("/study/daily-review", {
        params,
        paramsSerializer: { indexes: null },
      });

      const idSet = reviewBookScope === "all" ? null : new Set(reviewBookScope.map(String));
      const filtered = idSet
        ? (rows || []).filter((r) => r.book_id && idSet.has(String(r.book_id)))
        : (rows || []);
      return mapReviewRows(filtered);
    },
  });

  const availableChapters = useMemo(
    () => [...new Set(reviewItems.map((i) => i.card.chapter).filter(Boolean))].sort(),
    [reviewItems],
  );


  const activeChapterNames = useMemo(() => {
    if (availableChapters.length === 0) return null;
    const names = Object.entries(selectedChapters)
      .filter(([, v]) => v)
      .map(([name]) => name);
    if (names.length === 0) return [];
    if (names.length === availableChapters.length) return null;
    return names;
  }, [selectedChapters, availableChapters]);

  const displayItems = useMemo(() => {
    if (booksInitialized && activeBookIds.length === 0) return [];
    if (activeChapterNames === null) return reviewItems;
    if (activeChapterNames.length === 0) return [];
    const allowed = new Set(activeChapterNames);
    return reviewItems.filter((i) => i.card.chapter && allowed.has(i.card.chapter));
  }, [reviewItems, activeChapterNames, booksInitialized, activeBookIds.length]);

  const count = displayItems.length;

  useEffect(() => {
    if (books.length && Object.keys(selectedBooks).length === 0) {
      const init = {};
      books.forEach((b) => { init[b.id] = true; });
      setSelectedBooks(init);
    }
  }, [books, selectedBooks]);

  useEffect(() => {
    if (!availableChapters.length) {
      setSelectedChapters((prev) => (Object.keys(prev).length === 0 ? prev : {}));
      return;
    }
    setSelectedChapters((prev) => {
      if (Object.keys(prev).length > 0) return prev;
      const init = {};
      availableChapters.forEach((ch) => { init[ch] = true; });
      return init;
    });
  }, [availableChapters.join("|")]);

  useEffect(() => {
    setCurrentIdx(0);
    setLastRated(null);
    setSelectedChapters({});
  }, [activeBookIds.join("|")]);

  useEffect(() => {
    setCurrentIdx(0);
    setLastRated(null);
  }, [activeChapterNames?.join("|")]);

  useEffect(() => {
    setLastRated(null);
  }, [currentIdx]);

  useEffect(() => {
    if (currentIdx >= count && count > 0) {
      setCurrentIdx(count - 1);
    }
  }, [count, currentIdx]);

  const handleRate = async (rating) => {
    const item = displayItems[currentIdx];
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
      const { data } = await client.post("/study/progress", {
        card_id: item.card.id,
        quality,
      });
      const trustedEvents = parseTrustedCelebrationEvents(data);
      if (trustedEvents.length) {
        requestMany(trustedEvents);
        refreshAchievementSurfaces(queryClient, trustedEvents);
      }
      void queryClient.invalidateQueries({ queryKey: ["scorecards"] });
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

  const item = displayItems[currentIdx];

  const progressForBar = useMemo(() => {
    if (!item) return null;
    return { ...item.progress, rating: lastRated };
  }, [item, lastRated]);

  useEffect(() => {
    if (booksInitialized && activeBookIds.length === 0) {
      setShowFilters(true);
    }
  }, [booksInitialized, activeBookIds.length]);

  useEffect(() => {
    if (availableChapters.length > 0 && activeChapterNames?.length === 0) {
      setShowFilters(true);
    }
  }, [availableChapters.length, activeChapterNames?.length]);

  const scopeMessage = useMemo(() => {
    if (booksInitialized && activeBookIds.length === 0) {
      return {
        title: "No books selected",
        body: "Select at least one book below to continue your review.",
      };
    }
    if (availableChapters.length > 0 && activeChapterNames?.length === 0) {
      return {
        title: "No chapters selected",
        body: "Select at least one chapter below to continue your review.",
      };
    }
    if (count === 0 && !hardOnly && !isFetching && activeBookIds.length > 0) {
      return {
        title: "Nothing due today",
        body: "No flashcards are scheduled for review in this scope.",
      };
    }
    return null;
  }, [
    booksInitialized,
    activeBookIds.length,
    availableChapters.length,
    activeChapterNames?.length,
    count,
    hardOnly,
    isFetching,
  ]);

  const filtersOpen =
    showFilters
    || (booksInitialized && activeBookIds.length === 0)
    || (availableChapters.length > 0 && activeChapterNames?.length === 0);

  const restartHardSession = () => {
    setHardOnly(true);
    setSessionDone(false);
    setCurrentIdx(0);
    setSessionStats({ hard: 0, medium: 0, easy: 0, total: 0 });
    sessionStart.current = Date.now();
  };

  if (!user) return null;

  const initialLoading = isPending && reviewItems.length === 0;

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
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
        {isFetching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
        <span className="text-xs">{count ? `${currentIdx + 1} / ${count}` : "0 / 0"}</span>
      </div>

      {filtersOpen && (
        <div className="rounded-xl border border-border bg-card p-4 mb-4 space-y-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase">Books</p>
            <div className="max-h-[120px] overflow-y-auto space-y-2 pr-1">
              {books.map((b) => (
                <label key={b.id} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={!!selectedBooks[b.id]}
                    onCheckedChange={(v) => setSelectedBooks((prev) => ({ ...prev, [b.id]: !!v }))}
                  />
                  {b.title}
                </label>
              ))}
            </div>
          </div>
          {availableChapters.length > 0 ? (
            <div className="space-y-2 border-t border-border pt-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase">Chapters</p>
              <div className="max-h-[160px] overflow-y-auto space-y-2 pr-1">
                {availableChapters.map((ch) => (
                  <label key={ch} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={!!selectedChapters[ch]}
                      onCheckedChange={(v) => setSelectedChapters((prev) => ({ ...prev, [ch]: !!v }))}
                    />
                    {ch}
                  </label>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}

      <RatingOnboarding />

      <div className="flex flex-col items-center gap-8">
        {item ? (
          <>
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={item.card.id}
                custom={direction}
                initial={{ x: direction * 80, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: direction * -80, opacity: 0 }}
                className="w-full"
              >
                <p className="text-xs text-muted-foreground text-center mb-1">{item.setTitle}</p>
                {item.card.chapter ? (
                  <p className="text-xs text-primary text-center mb-2 font-medium">{item.card.chapter}</p>
                ) : null}
                <FlashCard
                  front={item.card.front}
                  back={item.card.back}
                  themeId={studyThemeId}
                  chapter={item.card.chapter}
                />
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
          </>
        ) : scopeMessage ? (
          <div className="text-center py-16 px-4">
            <Brain className="w-12 h-12 mx-auto text-muted-foreground/30 mb-4" />
            <h2 className="font-heading text-lg font-semibold mb-2">{scopeMessage.title}</h2>
            <p className="text-sm text-muted-foreground">{scopeMessage.body}</p>
          </div>
        ) : isFetching ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : null}
      </div>
    </div>
  );
}
