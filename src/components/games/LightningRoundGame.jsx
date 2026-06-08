import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Trophy, Zap, CheckCircle2, XCircle } from "lucide-react";

const DURATION = 60;

function shuffle(arr) { return [...arr].sort(() => Math.random() - 0.5); }

export default function LightningRoundGame({ cards, onRoundComplete }) {
  const questions = useRef(
    shuffle(cards).map(card => {
      const wrong = cards.filter(c => c.back !== card.back).sort(() => Math.random() - 0.5).slice(0, 1).map(c => c.back);
      return { q: card.front, correct: card.back, options: shuffle([card.back, wrong[0] || "None"]) };
    })
  ).current;

  const [qIdx, setQIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(DURATION);
  const [flash, setFlash] = useState(null); // 'correct' | 'wrong'
  const [gameOver, setGameOver] = useState(false);
  const [answered, setAnswered] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setTimeLeft(p => {
        if (p <= 1) {
          clearInterval(timerRef.current);
          setGameOver(true);
          return 0;
        }
        return p - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, []);

  const answer = (opt) => {
    if (gameOver) return;
    const correct = opt === questions[qIdx]?.correct;
    if (correct) setScore(s => s + 1);
    setAnswered(a => a + 1);
    setFlash(correct ? "correct" : "wrong");
    setTimeout(() => {
      setFlash(null);
      setQIdx(i => (i + 1) % questions.length);
    }, 250);
  };

  const urgency = timeLeft <= 10;
  const pct = (timeLeft / DURATION) * 100;
  const q = questions[qIdx];

  if (gameOver) {
    const accuracy = answered > 0 ? Math.round((score / answered) * 100) : 0;
    return (
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
        className="max-w-md mx-auto text-center bg-card rounded-3xl border border-border p-10">
        <div className="w-20 h-20 rounded-full bg-yellow-500/10 flex items-center justify-center mx-auto mb-5">
          <Zap className="w-10 h-10 text-yellow-400" />
        </div>
        <h2 className="font-heading text-3xl font-bold mb-2">Time's Up! ⚡</h2>
        <div className="text-6xl font-heading font-bold text-primary mb-2">{score}</div>
        <p className="text-muted-foreground mb-2">correct answers in 60 seconds</p>
        <p className="text-sm text-muted-foreground mb-6">{answered} answered • {accuracy}% accuracy</p>
        <Button onClick={() => onRoundComplete?.({ playerScore: score, computerScore: 0, totalRounds: answered })}>
          Continue
        </Button>
      </motion.div>
    );
  }

  return (
    <div className="max-w-xl mx-auto">
      {/* Timer bar */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-yellow-400" />
            <span className="font-heading font-bold text-sm">{score} correct</span>
          </div>
          <motion.span
            animate={urgency ? { scale: [1, 1.2, 1] } : {}}
            transition={{ repeat: Infinity, duration: 0.5 }}
            className={`text-2xl font-heading font-bold ${urgency ? "text-red-500" : "text-foreground"}`}
          >{timeLeft}s</motion.span>
        </div>
        <div className="h-3 bg-muted rounded-full overflow-hidden">
          <motion.div
            className={`h-full rounded-full transition-colors ${urgency ? "bg-red-500" : pct > 50 ? "bg-green-500" : "bg-yellow-500"}`}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>
      </div>

      {/* Flash overlay */}
      <AnimatePresence>
        {flash && (
          <motion.div
            key={flash}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className={`fixed inset-0 pointer-events-none z-50 ${flash === "correct" ? "bg-green-500/10" : "bg-red-500/10"}`}
          />
        )}
      </AnimatePresence>

      {/* Question */}
      <AnimatePresence mode="wait">
        <motion.div
          key={qIdx}
          initial={{ opacity: 0, y: 20, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.97 }}
          transition={{ duration: 0.15 }}
          className="bg-card rounded-2xl border border-border p-7 mb-5 shadow-sm text-center min-h-[100px] flex items-center justify-center"
        >
          <p className="font-heading font-semibold text-xl leading-snug">{q?.q}</p>
        </motion.div>
      </AnimatePresence>

      {/* Only 2 options — pure speed */}
      <div className="grid grid-cols-2 gap-3">
        {q?.options.map((opt, i) => (
          <motion.button
            key={`${qIdx}-${i}`}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.05 }}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => answer(opt)}
            className={`p-5 rounded-2xl border-2 font-medium text-sm text-center transition-all
              ${i === 0
                ? "border-primary/40 bg-primary/5 hover:bg-primary/15 hover:border-primary"
                : "border-accent/40 bg-accent/5 hover:bg-accent/15 hover:border-accent"}`}
          >
            <div className="text-lg mb-1">{i === 0 ? "⚡" : "💡"}</div>
            <span className="line-clamp-3">{opt}</span>
          </motion.button>
        ))}
      </div>

      <p className="text-center text-xs text-muted-foreground mt-4">
        {answered} answered — keep going!
      </p>
    </div>
  );
}