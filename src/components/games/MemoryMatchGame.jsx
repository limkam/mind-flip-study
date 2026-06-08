import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Trophy, Timer, RefreshCw } from "lucide-react";

function shuffle(arr) {
  return [...arr].sort(() => Math.random() - 0.5);
}

export default function MemoryMatchGame({ cards, onRoundComplete }) {
  const pairs = cards.slice(0, 8); // up to 8 pairs = 16 tiles
  const [tiles] = useState(() =>
    shuffle([
      ...pairs.map((c, i) => ({ id: `q${i}`, pairId: i, type: "question", text: c.front })),
      ...pairs.map((c, i) => ({ id: `a${i}`, pairId: i, type: "answer", text: c.back })),
    ])
  );

  const [flipped, setFlipped] = useState(new Set());
  const [matched, setMatched] = useState(new Set());
  const [selected, setSelected] = useState([]);
  const [wrong, setWrong] = useState(new Set());
  const [moves, setMoves] = useState(0);
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const timerRef = useRef(null);
  const lockRef = useRef(false);

  useEffect(() => {
    timerRef.current = setInterval(() => setTimeElapsed(p => p + 1), 1000);
    return () => clearInterval(timerRef.current);
  }, []);

  useEffect(() => {
    if (matched.size === tiles.length && tiles.length > 0) {
      clearInterval(timerRef.current);
      setTimeout(() => {
        setGameOver(true);
        onRoundComplete?.({ playerScore: pairs.length, computerScore: 0, totalRounds: pairs.length });
      }, 600);
    }
  }, [matched.size]);

  const flip = (tile) => {
    if (lockRef.current || flipped.has(tile.id) || matched.has(tile.id)) return;
    const next = [...selected, tile];
    setFlipped(p => new Set([...p, tile.id]));
    setSelected(next);

    if (next.length === 2) {
      setMoves(m => m + 1);
      lockRef.current = true;
      if (next[0].pairId === next[1].pairId && next[0].type !== next[1].type) {
        // Match!
        setTimeout(() => {
          setMatched(p => new Set([...p, next[0].id, next[1].id]));
          setSelected([]);
          lockRef.current = false;
        }, 500);
      } else {
        // No match
        setWrong(new Set([next[0].id, next[1].id]));
        setTimeout(() => {
          setFlipped(p => {
            const n = new Set(p);
            n.delete(next[0].id); n.delete(next[1].id);
            return n;
          });
          setWrong(new Set());
          setSelected([]);
          lockRef.current = false;
        }, 900);
      }
    }
  };

  const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  if (gameOver) {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
        className="max-w-md mx-auto text-center bg-card rounded-3xl border border-border p-10">
        <div className="w-20 h-20 rounded-full bg-yellow-500/10 flex items-center justify-center mx-auto mb-5">
          <Trophy className="w-10 h-10 text-yellow-400" />
        </div>
        <h2 className="font-heading text-3xl font-bold mb-2">Board Cleared! 🎉</h2>
        <p className="text-muted-foreground mb-6">{moves} moves • {fmt(timeElapsed)}</p>
        <Button onClick={() => onRoundComplete?.({ playerScore: pairs.length, computerScore: 0, totalRounds: pairs.length })}>
          Continue
        </Button>
      </motion.div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <span className="text-sm font-medium text-muted-foreground">{matched.size / 2} / {pairs.length} matched</span>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Timer className="w-4 h-4" /> {fmt(timeElapsed)}
        </div>
        <span className="text-sm text-muted-foreground">{moves} moves</span>
      </div>

      {/* Progress */}
      <div className="h-1.5 bg-muted rounded-full mb-5 overflow-hidden">
        <motion.div className="h-full bg-primary rounded-full"
          animate={{ width: `${(matched.size / tiles.length) * 100}%` }} />
      </div>

      <div className="grid grid-cols-4 gap-2">
        {tiles.map((tile) => {
          const isFlipped = flipped.has(tile.id);
          const isMatched = matched.has(tile.id);
          const isWrong = wrong.has(tile.id);

          return (
            <motion.button
              key={tile.id}
              onClick={() => flip(tile)}
              className="relative aspect-square"
              whileHover={!isFlipped && !isMatched ? { scale: 1.05 } : {}}
              whileTap={!isFlipped && !isMatched ? { scale: 0.95 } : {}}
            >
              <AnimatePresence initial={false} mode="wait">
                {isFlipped || isMatched ? (
                  <motion.div
                    key="front"
                    initial={{ rotateY: 90 }} animate={{ rotateY: 0 }} exit={{ rotateY: 90 }}
                    transition={{ duration: 0.18 }}
                    className={`absolute inset-0 rounded-xl flex items-center justify-center p-2 text-center text-[11px] font-medium leading-tight border-2
                      ${isMatched ? "bg-green-500/15 border-green-500/50 text-green-700 dark:text-green-400" :
                        isWrong ? "bg-red-500/15 border-red-400" :
                        tile.type === "question" ? "bg-primary/10 border-primary/40" : "bg-accent/10 border-accent/40"}`}
                  >
                    <span className="line-clamp-4">{tile.text}</span>
                  </motion.div>
                ) : (
                  <motion.div
                    key="back"
                    initial={{ rotateY: 90 }} animate={{ rotateY: 0 }} exit={{ rotateY: 90 }}
                    transition={{ duration: 0.18 }}
                    className="absolute inset-0 rounded-xl bg-gradient-to-br from-primary/30 to-accent/20 border border-primary/20 flex items-center justify-center cursor-pointer hover:from-primary/40 hover:to-accent/30 transition-colors"
                  >
                    <span className="text-2xl opacity-60">?</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.button>
          );
        })}
      </div>

      <p className="text-center text-xs text-muted-foreground mt-4">Match each question tile with its answer tile</p>
    </div>
  );
}