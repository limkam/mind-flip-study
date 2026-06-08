import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trophy, Cpu, ArrowRight, Shuffle, Timer, CheckCircle2, XCircle } from "lucide-react";

const COMPUTER_DELAY = 5; // seconds before computer "solves"
const TIME_PER_ROUND = 20;

function shuffleLetters(str) {
  const letters = str.split("");
  for (let i = letters.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [letters[i], letters[j]] = [letters[j], letters[i]];
  }
  return letters.join("");
}

function canScramble(str) {
  return str.length > 1 && new Set(str).size > 1;
}

function scramble(str) {
  if (!canScramble(str)) return str;
  for (let attempt = 0; attempt < 16; attempt++) {
    const result = shuffleLetters(str);
    if (result !== str) return result;
  }
  return str.slice(1) + str[0];
}

export default function WordScrambleGame({ cards, onRoundComplete }) {
  const rounds = cards.slice(0, 8).flatMap((c) => {
    const raw = c.back.split(".")[0].split(",")[0].trim();
    const word = raw.replace(/[^a-zA-Z0-9 ]/g, "").slice(0, 20).toUpperCase();
    if (!canScramble(word)) return [];
    return [{ question: c.front, answer: word, scrambled: scramble(word) }];
  });

  const [currentIdx, setCurrentIdx] = useState(0);
  const [playerInput, setPlayerInput] = useState("");
  const [playerScore, setPlayerScore] = useState(0);
  const [computerScore, setComputerScore] = useState(0);
  const [roundResult, setRoundResult] = useState(null); // 'player' | 'computer' | 'both'
  const [timeLeft, setTimeLeft] = useState(TIME_PER_ROUND);
  const [compCountdown, setCompCountdown] = useState(COMPUTER_DELAY);
  const [gameOver, setGameOver] = useState(false);
  const [letters, setLetters] = useState([]);
  const timerRef = useRef(null);
  const compRef = useRef(null);

  useEffect(() => {
    if (rounds[currentIdx]) {
      setLetters(rounds[currentIdx].scrambled.split(""));
      setPlayerInput("");
      setRoundResult(null);
      setTimeLeft(TIME_PER_ROUND);
      setCompCountdown(COMPUTER_DELAY);
    }
  }, [currentIdx]);

  // Main timer
  useEffect(() => {
    if (roundResult || gameOver) return;
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          clearInterval(compRef.current);
          setRoundResult("computer");
          setComputerScore(p => p + 1);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [currentIdx, roundResult, gameOver]);

  // Computer timer
  useEffect(() => {
    if (roundResult || gameOver) return;
    compRef.current = setInterval(() => {
      setCompCountdown(prev => {
        if (prev <= 1) {
          clearInterval(compRef.current);
          clearInterval(timerRef.current);
          if (!roundResult) {
            setRoundResult("computer");
            setComputerScore(p => p + 1);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(compRef.current);
  }, [currentIdx, roundResult, gameOver]);

  const handleSubmit = () => {
    if (roundResult) return;
    clearInterval(timerRef.current);
    clearInterval(compRef.current);
    const answer = playerInput.trim().toUpperCase();
    if (answer === rounds[currentIdx].answer) {
      setRoundResult("player");
      setPlayerScore(p => p + 1);
    } else {
      setRoundResult("wrong");
      setComputerScore(p => p + 1);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleSubmit();
  };

  const reshuffle = () => {
    setLetters(scramble(rounds[currentIdx].answer).split(""));
  };

  const nextRound = () => {
    if (currentIdx + 1 >= rounds.length) {
      setGameOver(true);
      onRoundComplete?.({ playerScore, computerScore, totalRounds: rounds.length });
    } else {
      setCurrentIdx(prev => prev + 1);
    }
  };

  if (rounds.length === 0) {
    return (
      <div className="max-w-md mx-auto text-center bg-card rounded-3xl border border-border p-10">
        <p className="text-muted-foreground">
          Need flashcards with answers of at least two different letters to play Word Scramble.
        </p>
        <Button className="mt-4" onClick={() => onRoundComplete?.({ playerScore: 0, computerScore: 0, totalRounds: 0 })}>
          Back to games
        </Button>
      </div>
    );
  }

  if (gameOver || currentIdx >= rounds.length) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-md mx-auto text-center bg-card rounded-3xl border border-border p-10"
      >
        <div className={`w-20 h-20 rounded-full mx-auto flex items-center justify-center mb-5 ${playerScore > computerScore ? "bg-green-500/10" : "bg-red-500/10"}`}>
          <Trophy className={`w-10 h-10 ${playerScore > computerScore ? "text-green-500" : "text-red-500"}`} />
        </div>
        <h2 className="font-heading text-3xl font-bold mb-2">
          {playerScore > computerScore ? "You Win! 🎉" : playerScore === computerScore ? "It's a Tie! 🤝" : "Computer Wins 🤖"}
        </h2>
        <div className="flex justify-center gap-10 my-5">
          <div><p className="text-3xl font-heading font-bold text-primary">{playerScore}</p><p className="text-xs text-muted-foreground">You</p></div>
          <div><p className="text-3xl font-heading font-bold text-red-500">{computerScore}</p><p className="text-xs text-muted-foreground">Computer</p></div>
        </div>
        <Button onClick={() => onRoundComplete?.({ playerScore, computerScore, totalRounds: rounds.length })}>
          Continue
        </Button>
      </motion.div>
    );
  }

  const round = rounds[currentIdx];
  const compProgress = ((COMPUTER_DELAY - compCountdown) / COMPUTER_DELAY) * 100;

  return (
    <div className="max-w-2xl mx-auto">
      {/* Scores */}
      <div className="flex items-center justify-between bg-card rounded-2xl border border-border p-4 mb-5">
        <div className="text-center flex-1">
          <p className="text-xs text-muted-foreground">You</p>
          <p className="font-heading text-2xl font-bold text-primary">{playerScore}</p>
        </div>
        <div className="text-muted-foreground font-bold">VS</div>
        <div className="text-center flex-1">
          <p className="text-xs text-muted-foreground">Computer</p>
          <p className="font-heading text-2xl font-bold text-red-500">{computerScore}</p>
        </div>
      </div>

      <p className="text-center text-sm text-muted-foreground mb-4">Round {currentIdx + 1} of {rounds.length}</p>

      {/* Timer */}
      <div className="flex items-center gap-3 mb-5">
        <Timer className={`w-4 h-4 ${timeLeft <= 5 ? "text-red-500" : "text-muted-foreground"}`} />
        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
          <motion.div
            className={`h-full rounded-full ${timeLeft <= 5 ? "bg-red-500" : "bg-primary"}`}
            animate={{ width: `${(timeLeft / TIME_PER_ROUND) * 100}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>
        <span className={`text-sm font-bold ${timeLeft <= 5 ? "text-red-500" : "text-muted-foreground"}`}>{timeLeft}s</span>
      </div>

      {/* Computer progress */}
      {!roundResult && (
        <div className="flex items-center gap-3 mb-6 bg-red-500/5 border border-red-500/20 rounded-xl px-4 py-2">
          <Cpu className="w-4 h-4 text-red-500 flex-shrink-0" />
          <div className="flex-1 h-1.5 bg-red-500/10 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-red-500 rounded-full"
              animate={{ width: `${compProgress}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
          <span className="text-xs text-red-500 font-medium">{compCountdown}s</span>
        </div>
      )}

      {/* Question */}
      <div className="bg-card rounded-xl border border-border p-4 mb-5 text-center">
        <p className="text-xs text-muted-foreground mb-1">What is the answer to:</p>
        <p className="font-medium text-sm">{round.question}</p>
      </div>

      {/* Scrambled letters */}
      <div className="flex flex-wrap justify-center gap-2 mb-6">
        {letters.map((letter, i) => (
          <motion.div
            key={i}
            layout
            className={`w-10 h-10 rounded-xl border-2 border-border bg-card flex items-center justify-center font-heading font-bold text-lg
              ${letter === " " ? "opacity-0" : "shadow-sm"}`}
          >
            {letter}
          </motion.div>
        ))}
        <button onClick={reshuffle} className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors ml-2">
          <Shuffle className="w-4 h-4" />
        </button>
      </div>

      {/* Input */}
      {!roundResult ? (
        <div className="flex gap-3">
          <Input
            value={playerInput}
            onChange={e => setPlayerInput(e.target.value.toUpperCase())}
            onKeyDown={handleKeyDown}
            placeholder="Type your answer..."
            className="flex-1 font-heading font-semibold text-lg h-12 tracking-widest text-center"
            maxLength={round.answer.length + 5}
            autoFocus
          />
          <Button onClick={handleSubmit} size="lg" className="px-6">Submit</Button>
        </div>
      ) : (
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`rounded-2xl p-5 text-center border-2 ${roundResult === "player" ? "bg-green-500/10 border-green-500/30" : "bg-red-500/10 border-red-500/30"}`}
          >
            {roundResult === "player" ? (
              <><CheckCircle2 className="w-8 h-8 text-green-500 mx-auto mb-2" /><p className="font-bold text-green-500 font-heading text-lg">You solved it first! 🎉</p></>
            ) : roundResult === "wrong" ? (
              <><XCircle className="w-8 h-8 text-red-500 mx-auto mb-2" /><p className="font-bold text-red-500 font-heading text-lg">Wrong answer!</p></>
            ) : (
              <><Cpu className="w-8 h-8 text-red-500 mx-auto mb-2" /><p className="font-bold text-red-500 font-heading text-lg">Computer solved it first!</p></>
            )}
            <p className="text-sm text-muted-foreground mt-1">Answer: <span className="font-bold text-foreground">{round.answer}</span></p>
            <Button onClick={nextRound} className="mt-4 gap-2">
              {currentIdx + 1 >= rounds.length ? "See Final Results" : "Next Round"}
              <ArrowRight className="w-4 h-4" />
            </Button>
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}