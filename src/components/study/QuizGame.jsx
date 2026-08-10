import React, { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, XCircle, Timer, Zap, Trophy, ArrowRight } from "lucide-react";
import { buildMcqQuestions, difficultyLabel, QUIZ_DIFFICULTY_MODES } from "@/lib/gameUtils";
import GameResultScreen from "@/components/games/GameResultScreen";
import { useFinishOnce } from "@/lib/gameLifecycle";

export default function QuizGame({ cards, setTitle, onComplete, generationSeed = 0, difficultyMode = "mixed" }) {
  const finishGame = useFinishOnce(onComplete);
  const [mode, setMode] = useState(difficultyMode);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [score, setScore] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [gameOver, setGameOver] = useState(false);
  const [pendingResult, setPendingResult] = useState(null);
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [streak, setStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const timerRef = useRef(null);

  const questions = useMemo(
    () => buildMcqQuestions(cards, { count: 20, seed: generationSeed, mode }),
    [cards, generationSeed, mode],
  );

  useEffect(() => {
    if (!questions.length) return;
    setCurrentIndex(0);
    setAnsweredCount(0);
    setSelectedAnswer(null);
    setShowResult(false);
    setScore(0);
    setAnswers([]);
    setGameOver(false);
    setPendingResult(null);
    setStreak(0);
    setMaxStreak(0);
    setTimeElapsed(0);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setTimeElapsed((prev) => prev + 1), 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [mode]);

  const handleAnswer = (answer) => {
    if (showResult) return;
    setSelectedAnswer(answer);
    setShowResult(true);
    setAnsweredCount((c) => c + 1);

    const isCorrect = answer === questions[currentIndex].correctAnswer;
    if (isCorrect) {
      setScore((prev) => prev + 1);
      setStreak((prev) => {
        const newStreak = prev + 1;
        setMaxStreak((ms) => Math.max(ms, newStreak));
        return newStreak;
      });
    } else {
      setStreak(0);
    }

    setAnswers((prev) => [
      ...prev,
      {
        question: questions[currentIndex].question,
        user_answer: answer,
        correct_answer: questions[currentIndex].correctAnswer,
        is_correct: isCorrect,
        difficulty: questions[currentIndex].difficulty,
      },
    ]);
  };

  const nextQuestion = () => {
    if (currentIndex + 1 >= questions.length) {
      if (timerRef.current) clearInterval(timerRef.current);
      const finalPct = Math.round((score / questions.length) * 100);
      setPendingResult({
        score,
        total_questions: questions.length,
        percentage: finalPct,
        time_taken_seconds: timeElapsed,
        answers,
        difficulty_mode: mode,
      });
      setGameOver(true);
    } else {
      setCurrentIndex((prev) => prev + 1);
      setSelectedAnswer(null);
      setShowResult(false);
    }
  };

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  if (questions.length === 0) return null;

  if (gameOver && pendingResult) {
    const pct = pendingResult.percentage;
    return (
      <GameResultScreen
        icon={
          <div className="w-20 h-20 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
            <Trophy className="w-10 h-10 text-primary" />
          </div>
        }
        title="Quiz Complete!"
        subtitle={`${setTitle} · ${difficultyLabel(mode)} · ${answeredCount} of ${questions.length} answered`}
        onContinue={onComplete}
        result={pendingResult}
        continueLabel="Continue"
      >
        <div className="text-6xl font-heading font-bold text-primary mb-2">{pct}%</div>
        <p className="text-muted-foreground mb-2">{pendingResult.score} out of {questions.length} correct</p>
      </GameResultScreen>
    );
  }

  const currentQ = questions[currentIndex];
  const progress = (answeredCount / questions.length) * 100;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex flex-wrap gap-2 mb-4">
        {QUIZ_DIFFICULTY_MODES.map((m) => (
          <Button
            key={m}
            size="sm"
            variant={mode === m ? "default" : "outline"}
            onClick={() => setMode(m)}
            disabled={showResult}
          >
            {difficultyLabel(m)}
          </Button>
        ))}
      </div>

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-muted-foreground">
            {answeredCount} of {questions.length} answered · Q {currentIndex + 1}
          </span>
          {currentQ.difficulty && (
            <span className="text-xs font-semibold uppercase bg-muted px-2 py-0.5 rounded">{currentQ.difficulty}</span>
          )}
          {streak > 1 && (
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="flex items-center gap-1 bg-yellow-500/10 text-yellow-500 px-2 py-1 rounded-full text-xs font-semibold">
              <Zap className="w-3 h-3" /> {streak} streak!
            </motion.div>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Timer className="w-4 h-4" /> {formatTime(timeElapsed)}
        </div>
      </div>

      <Progress value={progress} className="h-2 mb-8" />

      <AnimatePresence mode="wait">
        <motion.div key={currentIndex} initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }} className="bg-card rounded-2xl border border-border p-8 shadow-sm mb-6">
          {currentQ.chapter && (
            <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-1 rounded-md mb-4 inline-block">{currentQ.chapter}</span>
          )}
          <h3 className="text-xl font-heading font-semibold leading-relaxed">{currentQ.question}</h3>
        </motion.div>
      </AnimatePresence>

      <div className="grid gap-3">
        {currentQ.options.map((option, i) => {
          const isCorrect = option === currentQ.correctAnswer;
          const isSelected = option === selectedAnswer;
          let borderClass = "border-border hover:border-primary/40";
          if (showResult && isCorrect) borderClass = "border-green-500 bg-green-500/5";
          if (showResult && isSelected && !isCorrect) borderClass = "border-red-500 bg-red-500/5";

          return (
            <motion.button
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              onClick={() => handleAnswer(option)}
              disabled={showResult}
              className={`w-full text-left p-4 rounded-xl border-2 transition-all ${borderClass} ${!showResult ? "cursor-pointer" : ""}`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-semibold flex-shrink-0
                  ${showResult && isCorrect ? "bg-green-500 text-white" : ""}
                  ${showResult && isSelected && !isCorrect ? "bg-red-500 text-white" : ""}
                  ${!showResult ? "bg-muted text-muted-foreground" : ""}`}
                >
                  {showResult && isCorrect ? <CheckCircle2 className="w-4 h-4" /> :
                   showResult && isSelected && !isCorrect ? <XCircle className="w-4 h-4" /> :
                   String.fromCharCode(65 + i)}
                </div>
                <span className="text-sm font-medium line-clamp-3">{option}</span>
              </div>
            </motion.button>
          );
        })}
      </div>

      {showResult && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-6 flex justify-end">
          <Button type="button" onClick={nextQuestion} size="lg" className="gap-2">
            {currentIndex + 1 >= questions.length ? "See Results" : "Next Question"}
            <ArrowRight className="w-4 h-4" />
          </Button>
        </motion.div>
      )}
    </div>
  );
}
