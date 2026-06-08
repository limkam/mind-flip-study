import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, ArrowRight, Trophy, Timer } from "lucide-react";

const TIME_PER_QUESTION = 10;

export default function TugOfWarGame({ cards, onRoundComplete }) {
  const [questions] = useState(() =>
    cards.slice(0, 10).map(card => {
      const wrong = cards
        .filter(c => c.back !== card.back)
        .sort(() => Math.random() - 0.5)
        .slice(0, 3)
        .map(c => c.back);
      while (wrong.length < 3) wrong.push("None of the above");
      return {
        question: card.front,
        correct: card.back,
        options: [...wrong, card.back].sort(() => Math.random() - 0.5),
      };
    })
  );

  const [currentIdx, setCurrentIdx] = useState(0);
  const [ropePos, setRopePos] = useState(50); // 0=computer wins, 100=player wins, start center=50
  const [selected, setSelected] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [timeLeft, setTimeLeft] = useState(TIME_PER_QUESTION);
  const [gameOver, setGameOver] = useState(false);
  const [winner, setWinner] = useState(null);
  const [totalCorrect, setTotalCorrect] = useState(0);
  const timerRef = useRef(null);
  const timedOutRef = useRef(false);

  // Check win condition
  useEffect(() => {
    if (ropePos <= 5) { setWinner("computer"); setGameOver(true); }
    if (ropePos >= 95) { setWinner("player"); setGameOver(true); }
  }, [ropePos]);

  // Per-question timer
  useEffect(() => {
    if (showResult || gameOver) return;
    timedOutRef.current = false;
    setTimeLeft(TIME_PER_QUESTION);

    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          if (!timedOutRef.current) {
            timedOutRef.current = true;
            // Computer pulls
            setRopePos(p => Math.max(5, p - 15));
            setSelected("__timeout__");
            setShowResult(true);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, [currentIdx, showResult, gameOver]);

  const handleAnswer = (answer) => {
    if (showResult || gameOver) return;
    clearInterval(timerRef.current);
    setSelected(answer);
    setShowResult(true);
    const isCorrect = answer === questions[currentIdx].correct;
    if (isCorrect) {
      setTotalCorrect(p => p + 1);
      setRopePos(p => Math.min(95, p + 18)); // Pull right (player)
    } else {
      setRopePos(p => Math.max(5, p - 15)); // Pull left (computer)
    }
  };

  const nextQuestion = () => {
    if (currentIdx + 1 >= questions.length) {
      const w = ropePos > 50 ? "player" : "computer";
      setWinner(w);
      setGameOver(true);
      onRoundComplete?.({ playerScore: totalCorrect, computerScore: questions.length - totalCorrect, totalRounds: questions.length });
    } else {
      setCurrentIdx(prev => prev + 1);
      setSelected(null);
      setShowResult(false);
    }
  };

  if (gameOver) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-md mx-auto text-center bg-card rounded-3xl border border-border p-10"
      >
        <div className={`w-20 h-20 rounded-full mx-auto flex items-center justify-center mb-5 ${winner === "player" ? "bg-green-500/10" : "bg-red-500/10"}`}>
          <Trophy className={`w-10 h-10 ${winner === "player" ? "text-green-500" : "text-red-500"}`} />
        </div>
        <h2 className="font-heading text-3xl font-bold mb-2">
          {winner === "player" ? "You Win! 🎉" : "Computer Wins 🤖"}
        </h2>
        <p className="text-muted-foreground mb-6">
          {totalCorrect} out of {questions.length} correct answers
        </p>
        <Button onClick={() => onRoundComplete?.({ playerScore: totalCorrect, computerScore: questions.length - totalCorrect, totalRounds: questions.length })}>
          Continue
        </Button>
      </motion.div>
    );
  }

  const q = questions[currentIdx];
  const timerPct = (timeLeft / TIME_PER_QUESTION) * 100;

  return (
    <div className="max-w-2xl mx-auto">
      <p className="text-center text-sm text-muted-foreground mb-4">
        Question {currentIdx + 1} / {questions.length}
      </p>

      {/* Rope arena */}
      <div className="bg-card rounded-2xl border border-border p-5 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <motion.span
            animate={showResult && selected !== "__timeout__" && selected !== questions[currentIdx]?.correct ? { x: [0, 8, 0, 8, 0] } : showResult && selected === questions[currentIdx]?.correct ? {} : {}}
            transition={{ duration: 0.3 }}
            className="text-2xl"
          >🤖</motion.span>
          <div className="flex-1 relative h-6 bg-muted rounded-full overflow-hidden">
            <motion.div
              className="absolute inset-y-0 left-0 rounded-full"
              style={{ background: "linear-gradient(90deg, #ef4444 0%, #facc15 50%, #22c55e 100%)" }}
              animate={{ width: `${ropePos}%` }}
              transition={{ type: "spring", stiffness: 180, damping: 20 }}
            />
            {/* Rope knot */}
            <motion.div
              className="absolute top-1/2 -translate-y-1/2 w-5 h-5 bg-white border-2 border-primary rounded-full shadow-lg flex items-center justify-center text-[8px] font-bold text-primary"
              animate={{ left: `calc(${ropePos}% - 10px)` }}
              transition={{ type: "spring", stiffness: 180, damping: 20 }}
            >⊗</motion.div>
          </div>
          <motion.span
            animate={showResult && selected === questions[currentIdx]?.correct ? { x: [0, -8, 0, -8, 0] } : {}}
            transition={{ duration: 0.3 }}
            className="text-2xl"
          >🧑</motion.span>
        </div>
        <div className="flex justify-between text-xs text-muted-foreground px-8">
          <span>Computer</span>
          <span className="font-semibold text-primary">You</span>
        </div>
        {/* Pull indicator */}
        <AnimatePresence>
          {showResult && (
            <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className={`mt-2 text-center text-xs font-bold ${selected === questions[currentIdx]?.correct ? "text-green-500" : "text-red-500"}`}>
              {selected === questions[currentIdx]?.correct ? "💪 You pulled right!" : selected === "__timeout__" ? "⏰ Time's up — computer pulls!" : "❌ Wrong — computer pulls!"}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Timer */}
      <div className="flex items-center gap-3 mb-4">
        <Timer className={`w-4 h-4 ${timeLeft <= 3 ? "text-red-500" : "text-muted-foreground"}`} />
        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
          <motion.div
            className={`h-full rounded-full transition-colors ${timeLeft <= 3 ? "bg-red-500" : "bg-primary"}`}
            animate={{ width: `${timerPct}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
        <span className={`text-sm font-bold w-6 text-right ${timeLeft <= 3 ? "text-red-500" : "text-muted-foreground"}`}>{timeLeft}</span>
      </div>

      {/* Question */}
      <div className="bg-card rounded-2xl border border-border p-6 mb-5 shadow-sm">
        <p className="font-heading font-semibold text-lg leading-relaxed text-center">{q.question}</p>
      </div>

      {/* Options */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {q.options.map((option, i) => {
          const isSelected = selected === option;
          const isCorrect = option === q.correct;
          let cls = "border-border hover:border-primary/40 cursor-pointer";
          if (showResult && isCorrect) cls = "border-green-500 bg-green-500/5";
          if (showResult && isSelected && !isCorrect) cls = "border-red-500 bg-red-500/5";

          return (
            <motion.button
              key={i}
              whileTap={{ scale: 0.97 }}
              onClick={() => handleAnswer(option)}
              disabled={showResult}
              className={`w-full text-left p-4 rounded-xl border-2 transition-all text-sm font-medium ${cls}`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0
                  ${showResult && isCorrect ? "bg-green-500 text-white" : ""}
                  ${showResult && isSelected && !isCorrect ? "bg-red-500 text-white" : ""}
                  ${!showResult || (!isCorrect && !isSelected) ? "bg-muted text-muted-foreground" : ""}
                `}>
                  {showResult && isCorrect ? <CheckCircle2 className="w-4 h-4" /> :
                   showResult && isSelected && !isCorrect ? <XCircle className="w-4 h-4" /> :
                   String.fromCharCode(65 + i)}
                </div>
                <span className="line-clamp-2">{option}</span>
              </div>
            </motion.button>
          );
        })}
      </div>

      {showResult && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-5 flex justify-end">
          <Button onClick={nextQuestion} className="gap-2">
            {currentIdx + 1 >= questions.length ? "See Results" : "Next"}
            <ArrowRight className="w-4 h-4" />
          </Button>
        </motion.div>
      )}
    </div>
  );
}