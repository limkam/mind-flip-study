import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Trophy, Skull, ArrowRight, Heart } from "lucide-react";

const MAX_WRONG = 6;

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

function HangmanSVG({ wrong }) {
  return (
    <svg viewBox="0 0 200 220" className="w-40 h-40 mx-auto" strokeLinecap="round">
      {/* Gallows */}
      <line x1="20" y1="210" x2="180" y2="210" stroke="currentColor" strokeWidth="4" className="text-foreground" />
      <line x1="60" y1="210" x2="60" y2="20" stroke="currentColor" strokeWidth="4" className="text-foreground" />
      <line x1="60" y1="20" x2="130" y2="20" stroke="currentColor" strokeWidth="4" className="text-foreground" />
      <line x1="130" y1="20" x2="130" y2="45" stroke="currentColor" strokeWidth="4" className="text-foreground" />
      {/* Head */}
      {wrong >= 1 && <circle cx="130" cy="60" r="15" fill="none" stroke="#ef4444" strokeWidth="3" />}
      {/* Body */}
      {wrong >= 2 && <line x1="130" y1="75" x2="130" y2="135" stroke="#ef4444" strokeWidth="3" />}
      {/* Left arm */}
      {wrong >= 3 && <line x1="130" y1="90" x2="105" y2="115" stroke="#ef4444" strokeWidth="3" />}
      {/* Right arm */}
      {wrong >= 4 && <line x1="130" y1="90" x2="155" y2="115" stroke="#ef4444" strokeWidth="3" />}
      {/* Left leg */}
      {wrong >= 5 && <line x1="130" y1="135" x2="105" y2="170" stroke="#ef4444" strokeWidth="3" />}
      {/* Right leg */}
      {wrong >= 6 && <line x1="130" y1="135" x2="155" y2="170" stroke="#ef4444" strokeWidth="3" />}
    </svg>
  );
}

export default function HangmanGame({ cards, onRoundComplete }) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [guessed, setGuessed] = useState(new Set());
  const [wrongCount, setWrongCount] = useState(0);
  const [playerScore, setPlayerScore] = useState(0);
  const [computerScore, setComputerScore] = useState(0);
  const [roundResult, setRoundResult] = useState(null); // 'win' | 'lose'
  const [roundsDone, setRoundsDone] = useState(0);
  const totalRounds = Math.min(cards.length, 8);

  const getAnswer = () => {
    const raw = cards[currentIdx]?.back || "";
    // Take first sentence or up to 30 chars for the word/phrase
    const ans = raw.split(".")[0].split(",")[0].trim().toUpperCase();
    return ans.length > 25 ? ans.slice(0, 25) : ans;
  };

  const answer = getAnswer();
  const displayChars = answer.split("").filter(c => /[A-Z0-9]/.test(c));
  const uniqueChars = [...new Set(displayChars)];
  const allRevealed = uniqueChars.every(c => guessed.has(c));
  const isDead = wrongCount >= MAX_WRONG;

  useEffect(() => {
    if (allRevealed && !roundResult) {
      setRoundResult("win");
      setPlayerScore(prev => prev + 1);
    } else if (isDead && !roundResult) {
      setRoundResult("lose");
      setComputerScore(prev => prev + 1);
    }
  }, [allRevealed, isDead, roundResult]);

  const guess = (letter) => {
    if (guessed.has(letter) || roundResult) return;
    const newGuessed = new Set([...guessed, letter]);
    setGuessed(newGuessed);
    if (!answer.includes(letter)) {
      setWrongCount(prev => prev + 1);
    }
  };

  const nextRound = () => {
    const next = currentIdx + 1;
    if (next >= totalRounds) {
      onRoundComplete?.({ playerScore: playerScore + (roundResult === "win" ? 0 : 0), computerScore, totalRounds });
    } else {
      setCurrentIdx(next);
      setGuessed(new Set());
      setWrongCount(0);
      setRoundResult(null);
      setRoundsDone(prev => prev + 1);
    }
  };

  const livesLeft = MAX_WRONG - wrongCount;

  return (
    <div className="max-w-2xl mx-auto">
      {/* Scoreboard */}
      <div className="flex items-center justify-between bg-card rounded-2xl border border-border p-4 mb-6">
        <div className="text-center flex-1">
          <p className="text-xs text-muted-foreground mb-1">You</p>
          <p className="font-heading text-3xl font-bold text-primary">{playerScore}</p>
        </div>
        <div className="text-muted-foreground font-heading font-bold text-lg px-6">VS</div>
        <div className="text-center flex-1">
          <p className="text-xs text-muted-foreground mb-1">Computer</p>
          <p className="font-heading text-3xl font-bold text-red-500">{computerScore}</p>
        </div>
      </div>

      {/* Progress */}
      <p className="text-center text-sm text-muted-foreground mb-4">Round {currentIdx + 1} of {totalRounds}</p>

      {/* Hint / Question */}
      <div className="bg-muted/50 rounded-xl p-4 mb-6 text-center">
        <p className="text-xs text-muted-foreground mb-1">Question</p>
        <p className="text-sm font-medium">{cards[currentIdx]?.front}</p>
      </div>

      {/* Hangman Drawing */}
      <motion.div
        key={wrongCount}
        animate={wrongCount > 0 ? { x: [-6, 6, -4, 4, 0] } : {}}
        transition={{ duration: 0.35 }}
      >
        <HangmanSVG wrong={wrongCount} />
      </motion.div>

      {/* Lives */}
      <div className="flex items-center justify-center gap-1.5 my-4">
        {Array.from({ length: MAX_WRONG }).map((_, i) => (
          <Heart key={i} className={`w-5 h-5 ${i < livesLeft ? "text-red-500 fill-red-500" : "text-muted-foreground"}`} />
        ))}
      </div>

      {/* Word display */}
      <div className="flex flex-wrap justify-center gap-2 mb-8 px-4">
        {answer.split("").map((char, i) => {
          const isLetter = /[A-Z0-9]/.test(char);
          const revealed = guessed.has(char);
          return (
            <div key={i} className={`flex flex-col items-center justify-end ${char === " " ? "w-4" : "w-8"}`}>
              {isLetter ? (
                <>
                  <AnimatePresence>
                    {revealed ? (
                      <motion.span
                        key="revealed"
                        initial={{ scale: 0, y: -10, opacity: 0 }}
                        animate={{ scale: 1, y: 0, opacity: 1 }}
                        transition={{ type: "spring", stiffness: 400, damping: 18 }}
                        className="text-xl font-heading font-bold leading-none mb-1 text-foreground"
                      >{char}</motion.span>
                    ) : (
                      <motion.span key="blank" className="text-xl font-heading font-bold leading-none mb-1 text-muted-foreground/40">_</motion.span>
                    )}
                  </AnimatePresence>
                  <div className={`w-full h-0.5 rounded-full transition-colors ${revealed ? "bg-primary" : "bg-border"}`} />
                </>
              ) : (
                <span className="text-xl font-heading font-bold mb-1 text-muted-foreground">{char}</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Result overlay */}
      <AnimatePresence>
        {roundResult && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`rounded-2xl p-6 text-center mb-6 border-2 ${roundResult === "win" ? "bg-green-500/10 border-green-500/30" : "bg-red-500/10 border-red-500/30"}`}
          >
            {roundResult === "win" ? (
              <>
                <Trophy className="w-10 h-10 text-green-500 mx-auto mb-2" />
                <p className="font-heading text-xl font-bold text-green-500">You got it!</p>
              </>
            ) : (
              <>
                <Skull className="w-10 h-10 text-red-500 mx-auto mb-2" />
                <p className="font-heading text-xl font-bold text-red-500">Computer wins this round!</p>
                <p className="text-sm text-muted-foreground mt-1">Answer: <span className="font-semibold text-foreground">{answer}</span></p>
              </>
            )}
            <Button onClick={nextRound} className="mt-4 gap-2">
              {currentIdx + 1 >= totalRounds ? "See Final Results" : "Next Round"}
              <ArrowRight className="w-4 h-4" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Keyboard */}
      {!roundResult && (
        <div className="flex flex-wrap justify-center gap-1.5">
          {ALPHABET.map((letter, li) => {
            const isGuessed = guessed.has(letter);
            const isCorrect = isGuessed && answer.includes(letter);
            const isWrong = isGuessed && !answer.includes(letter);
            return (
              <motion.button
                key={letter}
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: li * 0.012, type: "spring", stiffness: 300 }}
                whileHover={!isGuessed ? { scale: 1.15, y: -2 } : {}}
                whileTap={{ scale: 0.85 }}
                onClick={() => guess(letter)}
                disabled={isGuessed}
                className={`w-9 h-9 rounded-lg text-sm font-bold transition-all duration-150
                  ${isCorrect ? "bg-green-500 text-white shadow-md shadow-green-500/30" : ""}
                  ${isWrong ? "bg-red-500/20 text-red-400 line-through opacity-50" : ""}
                  ${!isGuessed ? "bg-muted hover:bg-primary hover:text-white cursor-pointer" : ""}
                `}
              >
                {letter}
              </motion.button>
            );
          })}
        </div>
      )}
    </div>
  );
}