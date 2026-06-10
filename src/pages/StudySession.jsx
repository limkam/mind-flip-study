import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import client from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import {
  getCachedStudySet,
  invalidateStudySet,
  queueProgressSync,
  resolveStudySetForSession,
} from "@/lib/offlineCache";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  ArrowLeft, GraduationCap, Gamepad2, Loader2,
  ChevronLeft, ChevronRight, BookOpen, Brain, Lightbulb
} from "lucide-react";
import { selectGameCards } from "@/lib/gameUtils";
import FlashCard from "@/components/study/FlashCard";
import SummaryView from "@/components/study/SummaryView";
import ScenarioView from "@/components/study/ScenarioView";
import QuizGame from "@/components/study/QuizGame";
import GameSelector from "@/components/games/GameSelector";
import HangmanGame from "@/components/games/HangmanGame";
import TugOfWarGame from "@/components/games/TugOfWarGame";
import BricksGame from "@/components/games/BricksGame";
import MemoryMatchGame from "@/components/games/MemoryMatchGame";
import LightningRoundGame from "@/components/games/LightningRoundGame";
import BattleRPGGame from "@/components/games/BattleRPGGame";
import WordScrambleGame from "@/components/games/WordScrambleGame";
import SpacedRepetitionBar from "@/components/study/SpacedRepetitionBar";
import RetryDeck from "@/components/study/RetryDeck";
import { useToast } from "@/components/ui/use-toast";

export default function StudySession() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const [mode, setMode] = useState("flashcards");
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [slideDirection, setSlideDirection] = useState(1); // 1 = forward, -1 = backward
  const [selectedGame, setSelectedGame] = useState(null);
  const [cardProgressMap, setCardProgressMap] = useState({}); // index -> progress record
  const [retryCards, setRetryCards] = useState(null); // null = hidden, array = show retry
  const [offlineHint, setOfflineHint] = useState(false);

  const { data: flashcardSet, isLoading } = useQuery({
    queryKey: ["flashcard-set", id],
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    queryFn: async () => {
      try {
        const { data } = await client.get(`/flashcard-sets/${id}`);
        return resolveStudySetForSession(data, id);
      } catch (err) {
        const status = err.response?.status;
        if (status === 404) {
          await invalidateStudySet(id);
          throw err;
        }
        if (!navigator.onLine) {
          const cached = await getCachedStudySet(id);
          if (cached) return cached;
        }
        throw err;
      }
    },
  });

  // Load card progress for this set
  useEffect(() => {
    if (!flashcardSet) return;
    const load = async () => {
      const cardsList = flashcardSet.cards || [];
      const idSet = new Set(cardsList.map((c) => c.id));
      const { data: records } = await client.get("/card-progress/");
      const map = {};
      (records || []).forEach((r) => {
        if (!idSet.has(r.card_id)) return;
        const idx = cardsList.findIndex((c) => c.id === r.card_id);
        if (idx >= 0) map[idx] = r;
      });
      setCardProgressMap(map);
    };
    load();
  }, [flashcardSet?.id]);

  const handleCardRate = async (index, rating) => {
    if (!user || !flashcardSet) return;
    const cardsList = flashcardSet.cards || [];
    const card = cardsList[index];
    if (!card) return;
    const qualityMap = { hard: 2, medium: 3, easy: 5 };
    const quality = qualityMap[rating];
    if (quality == null) return;
    if (navigator.onLine) {
      const { data: record } = await client.post("/study/progress", {
        card_id: card.id,
        quality,
      });
      setCardProgressMap((prev) => ({ ...prev, [index]: { ...record, rating } }));
      setOfflineHint(false);
    } else {
      await queueProgressSync({
        card_id: card.id,
        quality,
        timestamp: Date.now(),
      });
      setCardProgressMap((prev) => ({
        ...prev,
        [index]: { card_id: card.id, quality, rating },
      }));
      setOfflineHint(true);
    }
  };

  const handleQuizComplete = async (result) => {
    await client.post("/quiz-results/", {
      set_id: id,
      score: result.score,
      total_questions: result.total_questions,
      time_taken_seconds: result.time_taken_seconds,
      extras: {
        set_title: flashcardSet.title,
        book_title: flashcardSet.book_title,
        percentage: result.percentage,
        answers: result.answers || [],
      },
    });
    queryClient.invalidateQueries({ queryKey: ['quiz-results'] });
    queryClient.invalidateQueries({ queryKey: ['analytics-summary'] });
    toast({ title: `Quiz saved! You scored ${result.percentage}%` });
    // Show retry deck if any wrong answers
    if (result.answers) {
      const wrong = result.answers
        .filter(a => !a.is_correct)
        .map(a => cards.find(c => c.front === a.question))
        .filter(Boolean);
      if (wrong.length > 0) setRetryCards(wrong);
    }
  };

  const handleGameComplete = async (result) => {
    const pct = Math.round((result.playerScore / result.totalRounds) * 100);
    await client.post("/quiz-results/", {
      set_id: id,
      score: result.playerScore,
      total_questions: result.totalRounds,
      time_taken_seconds: 0,
      extras: {
        set_title: `[${selectedGame?.toUpperCase()}] ${flashcardSet?.title}`,
        book_title: flashcardSet?.book_title,
        percentage: pct,
      },
    });
    queryClient.invalidateQueries({ queryKey: ['quiz-results'] });
    queryClient.invalidateQueries({ queryKey: ['analytics-summary'] });
    toast({ title: `Game over! ${result.playerScore} / ${result.totalRounds} rounds won` });
    setSelectedGame(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!flashcardSet) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Flashcard set not found</p>
      </div>
    );
  }

  const cards = flashcardSet.cards || [];
  const gameSeed = flashcardSet.generation_seed || 0;

  // Spaced repetition stats
  const hardCount = Object.values(cardProgressMap).filter(p => p.rating === "hard").length;
  const easyCount = Object.values(cardProgressMap).filter(p => p.rating === "easy").length;
  const ratedCount = Object.values(cardProgressMap).length;

  const gameCards = React.useMemo(() => {
    const perf = ratedCount / Math.max(cards.length, 1);
    return selectGameCards(cards, cards.length, gameSeed, perf);
  }, [cards, gameSeed, ratedCount]);

  return (
    <div className="max-w-4xl mx-auto">
      <Button variant="ghost" className="gap-2 mb-6 text-muted-foreground" onClick={() => navigate(-1)}>
        <ArrowLeft className="w-4 h-4" /> Back
      </Button>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <h1 className="font-heading text-2xl lg:text-3xl font-bold">{flashcardSet.title}</h1>
        <p className="text-muted-foreground mt-1">
          {cards.length} cards • {flashcardSet.book_title}
        </p>
        {offlineHint && (
          <p className="text-xs text-amber-600 mt-2">
            Offline — progress saved locally and will sync when you reconnect.
          </p>
        )}
        {ratedCount > 0 && (
          <div className="flex items-center gap-3 mt-3 flex-wrap">
            <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Brain className="w-3.5 h-3.5" /> {ratedCount}/{cards.length} rated
            </span>
            {easyCount > 0 && <span className="text-xs font-semibold text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-full">{easyCount} easy</span>}
            {hardCount > 0 && <span className="text-xs font-semibold text-rose-600 bg-rose-500/10 px-2 py-0.5 rounded-full">{hardCount} hard</span>}
          </div>
        )}
      </motion.div>

      <Tabs value={mode} onValueChange={(v) => { setMode(v); setSelectedGame(null); }} className="mb-8">
        <TabsList className="w-full max-w-2xl mx-auto grid grid-cols-4 h-12">
          <TabsTrigger value="flashcards" className="gap-1.5 text-sm font-medium">
            <GraduationCap className="w-4 h-4" /> Study Cards
          </TabsTrigger>
          <TabsTrigger value="summary" className="gap-1.5 text-sm font-medium">
            <BookOpen className="w-4 h-4" /> Summary
          </TabsTrigger>
          <TabsTrigger value="scenarios" className="gap-1.5 text-sm font-medium">
            <Lightbulb className="w-4 h-4" /> Scenarios
          </TabsTrigger>
          <TabsTrigger value="quiz" className="gap-1.5 text-sm font-medium">
            <Gamepad2 className="w-4 h-4" /> Games
          </TabsTrigger>
        </TabsList>

        {/* ── FLASHCARD TAB ── */}
        <TabsContent value="flashcards" className="mt-10">
          {cards.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">No cards in this set</p>
          ) : (
            <div className="flex flex-col items-center gap-8">

              {/* Progress bar */}
              <div className="w-full max-w-lg">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Progress</span>
                  <span className="text-xs font-bold text-primary">{currentCardIndex + 1} / {cards.length}</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-primary to-violet-500 rounded-full"
                    animate={{ width: `${((currentCardIndex + 1) / cards.length) * 100}%` }}
                    transition={{ type: "spring", stiffness: 200, damping: 25 }}
                  />
                </div>
              </div>

              {/* Card */}
              <div className="w-full max-w-xl overflow-hidden">
                <AnimatePresence mode="wait" custom={slideDirection}>
                  <motion.div
                    key={currentCardIndex}
                    custom={slideDirection}
                    variants={{
                      enter: (dir) => ({ x: dir * 360, opacity: 0, scale: 0.96 }),
                      center: { x: 0, opacity: 1, scale: 1 },
                      exit: (dir) => ({ x: dir * -360, opacity: 0, scale: 0.96 }),
                    }}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ type: "spring", stiffness: 320, damping: 32 }}
                  >
                    <FlashCard
                      front={cards[currentCardIndex].front}
                      back={cards[currentCardIndex].back}
                      difficulty={cards[currentCardIndex].difficulty}
                      chapter={cards[currentCardIndex].chapter}
                    />
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Navigation */}
              <div className="flex items-center gap-5">
                <motion.div whileTap={{ scale: 0.92 }}>
                  <Button
                    variant="outline"
                    size="icon"
                    className="w-11 h-11 rounded-full shadow-sm"
                    onClick={() => { setSlideDirection(-1); setCurrentCardIndex(prev => Math.max(0, prev - 1)); }}
                    disabled={currentCardIndex === 0}
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </Button>
                </motion.div>

                {/* Dot indicators — max 10 visible */}
                <div className="flex items-center gap-1.5">
                  {cards.map((_, i) => {
                    const progress = cardProgressMap[i];
                    const dotColor = progress?.rating === "easy"
                      ? "bg-emerald-400"
                      : progress?.rating === "hard"
                      ? "bg-rose-400"
                      : progress?.rating === "medium"
                      ? "bg-amber-400"
                      : "bg-muted-foreground/25";
                    return (
                      <button
                        key={i}
                        onClick={() => { setSlideDirection(i > currentCardIndex ? 1 : -1); setCurrentCardIndex(i); }}
                        className={`rounded-full transition-all duration-300 hover:scale-125
                          ${i === currentCardIndex
                            ? "w-5 h-2.5 bg-primary"
                            : `w-2 h-2 ${dotColor}`}`}
                      />
                    );
                  })}
                </div>

                <motion.div whileTap={{ scale: 0.92 }}>
                  <Button
                    variant="outline"
                    size="icon"
                    className="w-11 h-11 rounded-full shadow-sm"
                    onClick={() => { setSlideDirection(1); setCurrentCardIndex(prev => Math.min(cards.length - 1, prev + 1)); }}
                    disabled={currentCardIndex === cards.length - 1}
                  >
                    <ChevronRight className="w-5 h-5" />
                  </Button>
                </motion.div>
              </div>

              {/* Spaced repetition rating */}
              <div className="w-full max-w-xl">
                <SpacedRepetitionBar
                  onRate={(rating) => handleCardRate(currentCardIndex, rating)}
                  cardProgress={cardProgressMap[currentCardIndex]}
                />
              </div>

            </div>
          )}
        </TabsContent>

        {/* ── RETRY DECK ── */}
        {retryCards && mode === "flashcards" && (
          <div className="mt-6">
            <RetryDeck wrongCards={retryCards} onDone={() => setRetryCards(null)} />
          </div>
        )}

        {/* ── SUMMARY TAB ── */}
        <TabsContent value="summary" className="mt-8">
          <SummaryView
            cards={cards}
            bookTitle={flashcardSet.book_title}
            selectedChapters={flashcardSet.selected_chapters || []}
            prefillSummary={flashcardSet.summary}
            chapterSummaries={flashcardSet.chapter_summaries || []}
          />
        </TabsContent>

        <TabsContent value="scenarios" className="mt-8">
          <ScenarioView scenarios={flashcardSet.scenarios || []} />
        </TabsContent>

        {/* ── GAMES TAB ── */}
        <TabsContent value="quiz" className="mt-8">
          {cards.length < 4 ? (
            <p className="text-center text-muted-foreground py-12">
              Need at least 4 cards for games. This set has {cards.length}.
            </p>
          ) : (
            <AnimatePresence mode="wait">
              {!selectedGame && (
                <motion.div key="selector" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <GameSelector onSelect={setSelectedGame} />
                </motion.div>
              )}

              {selectedGame === "mcq" && (
                <motion.div key="mcq" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="font-heading text-lg font-semibold">Classic Quiz</h3>
                    <Button variant="ghost" size="sm" onClick={() => setSelectedGame(null)} className="text-muted-foreground">
                      ← Change Game
                    </Button>
                  </div>
                  <QuizGame
                    key="mcq-game"
                    cards={cards}
                    setTitle={flashcardSet.title}
                    generationSeed={flashcardSet.generation_seed || 0}
                    onComplete={handleQuizComplete}
                  />
                </motion.div>
              )}

              {selectedGame === "hangman" && (
                <motion.div key="hangman" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="font-heading text-lg font-semibold">🎯 Hangman</h3>
                    <Button variant="ghost" size="sm" onClick={() => setSelectedGame(null)} className="text-muted-foreground">
                      ← Change Game
                    </Button>
                  </div>
                  <HangmanGame
                    key="hangman-game"
                    cards={gameCards}
                    onRoundComplete={handleGameComplete}
                  />
                </motion.div>
              )}

              {selectedGame === "tugofwar" && (
                <motion.div key="tugofwar" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="font-heading text-lg font-semibold">🪢 Tug of War</h3>
                    <Button variant="ghost" size="sm" onClick={() => setSelectedGame(null)} className="text-muted-foreground">
                      ← Change Game
                    </Button>
                  </div>
                  <TugOfWarGame
                    key="tug-game"
                    cards={gameCards}
                    onRoundComplete={handleGameComplete}
                  />
                </motion.div>
              )}

              {selectedGame === "bricks" && (
                <motion.div key="bricks" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="font-heading text-lg font-semibold">🧱 Brick Breaker</h3>
                    <Button variant="ghost" size="sm" onClick={() => setSelectedGame(null)} className="text-muted-foreground">← Change Game</Button>
                  </div>
                  <BricksGame key="bricks-game" cards={gameCards} onRoundComplete={handleGameComplete} />
                </motion.div>
              )}

              {selectedGame === "memory" && (
                <motion.div key="memory" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="font-heading text-lg font-semibold">🃏 Memory Match</h3>
                    <Button variant="ghost" size="sm" onClick={() => setSelectedGame(null)} className="text-muted-foreground">← Change Game</Button>
                  </div>
                  <MemoryMatchGame key="memory-game" cards={gameCards} onRoundComplete={handleGameComplete} />
                </motion.div>
              )}

              {selectedGame === "lightning" && (
                <motion.div key="lightning" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="font-heading text-lg font-semibold">⚡ Lightning Round</h3>
                    <Button variant="ghost" size="sm" onClick={() => setSelectedGame(null)} className="text-muted-foreground">← Change Game</Button>
                  </div>
                  <LightningRoundGame key="lightning-game" cards={gameCards} onRoundComplete={handleGameComplete} />
                </motion.div>
              )}

              {selectedGame === "battle" && (
                <motion.div key="battle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="font-heading text-lg font-semibold">⚔️ Battle RPG</h3>
                    <Button variant="ghost" size="sm" onClick={() => setSelectedGame(null)} className="text-muted-foreground">← Change Game</Button>
                  </div>
                  <BattleRPGGame key="battle-game" cards={gameCards} onRoundComplete={handleGameComplete} />
                </motion.div>
              )}

              {selectedGame === "scramble" && (
                <motion.div key="scramble" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="font-heading text-lg font-semibold">🔤 Word Scramble</h3>
                    <Button variant="ghost" size="sm" onClick={() => setSelectedGame(null)} className="text-muted-foreground">← Change Game</Button>
                  </div>
                  <WordScrambleGame key="scramble-game" cards={gameCards} onRoundComplete={handleGameComplete} />
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}