import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Sword, Shield, Skull, Trophy } from "lucide-react";

const PLAYER_MAX_HP = 100;
const ENEMY_MAX_HP = 100;
const PLAYER_ATTACK = 22;
const ENEMY_ATTACK = 18;
const ENEMIES = [
  { name: "Goblin", emoji: "👺" },
  { name: "Dragon", emoji: "🐉" },
  { name: "Wizard", emoji: "🧙" },
  { name: "Robot", emoji: "🤖" },
  { name: "Ghost", emoji: "👻" },
];

function HPBar({ hp, max, color }) {
  const pct = Math.max(0, (hp / max) * 100);
  return (
    <div className="h-3 bg-muted rounded-full overflow-hidden">
      <motion.div
        className={`h-full rounded-full ${color}`}
        animate={{ width: `${pct}%` }}
        transition={{ type: "spring", stiffness: 120, damping: 18 }}
      />
    </div>
  );
}

export default function BattleRPGGame({ cards, onRoundComplete }) {
  const questions = useRef(
    cards.slice(0, 12).map(card => {
      const wrong = cards.filter(c => c.back !== card.back).sort(() => Math.random() - 0.5).slice(0, 3).map(c => c.back);
      while (wrong.length < 3) wrong.push("None of the above");
      return { q: card.front, correct: card.back, options: [...wrong, card.back].sort(() => Math.random() - 0.5) };
    })
  ).current;

  const [qIdx, setQIdx] = useState(0);
  const [playerHP, setPlayerHP] = useState(PLAYER_MAX_HP);
  const [enemyHP, setEnemyHP] = useState(ENEMY_MAX_HP);
  const [enemy] = useState(() => ENEMIES[Math.floor(Math.random() * ENEMIES.length)]);
  const [selected, setSelected] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [battleLog, setBattleLog] = useState("");
  const [shake, setShake] = useState(null); // 'player' | 'enemy'
  const [gameOver, setGameOver] = useState(false);
  const [winner, setWinner] = useState(null);
  const [score, setScore] = useState(0);

  const triggerShake = (who) => {
    setShake(who);
    setTimeout(() => setShake(null), 400);
  };

  const handleAnswer = (opt) => {
    if (showResult || gameOver) return;
    setSelected(opt);
    setShowResult(true);
    const correct = opt === questions[qIdx]?.correct;

    if (correct) {
      const dmg = PLAYER_ATTACK + Math.floor(Math.random() * 8);
      setBattleLog(`⚔️ You deal ${dmg} damage!`);
      triggerShake("enemy");
      setScore(s => s + 1);
      setEnemyHP(hp => {
        const next = Math.max(0, hp - dmg);
        if (next === 0) setTimeout(() => { setWinner("player"); setGameOver(true); }, 900);
        return next;
      });
    } else {
      const dmg = ENEMY_ATTACK + Math.floor(Math.random() * 6);
      setBattleLog(`💥 ${enemy.name} hits you for ${dmg} damage!`);
      triggerShake("player");
      setPlayerHP(hp => {
        const next = Math.max(0, hp - dmg);
        if (next === 0) setTimeout(() => { setWinner("enemy"); setGameOver(true); }, 900);
        return next;
      });
    }
  };

  const next = () => {
    if (qIdx + 1 >= questions.length) {
      const w = playerHP > enemyHP ? "player" : "enemy";
      setWinner(w);
      setGameOver(true);
      return;
    }
    setQIdx(i => i + 1);
    setSelected(null);
    setShowResult(false);
    setBattleLog("");
  };

  if (gameOver) {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
        className="max-w-md mx-auto text-center bg-card rounded-3xl border border-border p-10">
        <div className={`w-20 h-20 rounded-full mx-auto flex items-center justify-center mb-5 text-4xl ${winner === "player" ? "bg-yellow-500/10" : "bg-red-500/10"}`}>
          {winner === "player" ? "🏆" : "💀"}
        </div>
        <h2 className="font-heading text-3xl font-bold mb-2">
          {winner === "player" ? "Victory! 🎉" : `Defeated by ${enemy.name}!`}
        </h2>
        <p className="text-muted-foreground mb-6">{score} correct answers • {playerHP} HP remaining</p>
        <Button onClick={() => onRoundComplete?.({ playerScore: score, computerScore: questions.length - score, totalRounds: questions.length })}>
          Continue
        </Button>
      </motion.div>
    );
  }

  const q = questions[qIdx];

  return (
    <div className="max-w-2xl mx-auto">
      {/* Battle arena */}
      <div className="bg-gradient-to-b from-slate-900 to-slate-800 rounded-2xl border border-slate-700 p-5 mb-5">
        <div className="grid grid-cols-2 gap-6">
          {/* Player */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-green-400">YOU</span>
              <span className="text-xs text-green-400 font-bold">{playerHP}/{PLAYER_MAX_HP}</span>
            </div>
            <HPBar hp={playerHP} max={PLAYER_MAX_HP} color="bg-green-500" />
            <motion.div
              animate={shake === "player" ? { x: [-8, 8, -6, 6, 0] } : {}}
              transition={{ duration: 0.3 }}
              className="text-center mt-3 text-5xl"
            >🧙‍♂️</motion.div>
          </div>

          {/* Enemy */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-red-400">{enemy.name.toUpperCase()}</span>
              <span className="text-xs text-red-400 font-bold">{enemyHP}/{ENEMY_MAX_HP}</span>
            </div>
            <HPBar hp={enemyHP} max={ENEMY_MAX_HP} color="bg-red-500" />
            <motion.div
              animate={shake === "enemy" ? { x: [8, -8, 6, -6, 0] } : {}}
              transition={{ duration: 0.3 }}
              className="text-center mt-3 text-5xl"
            >{enemy.emoji}</motion.div>
          </div>
        </div>

        {/* Battle log */}
        <AnimatePresence mode="wait">
          {battleLog && (
            <motion.div
              key={battleLog}
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="mt-3 text-center text-sm font-semibold text-white/80 bg-white/5 rounded-lg py-2"
            >{battleLog}</motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Question */}
      <AnimatePresence mode="wait">
        <motion.div key={qIdx}
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
          className="bg-card rounded-2xl border border-border p-5 mb-4 shadow-sm"
        >
          <div className="flex items-center gap-2 mb-2">
            <Sword className="w-4 h-4 text-primary" />
            <span className="text-xs font-semibold text-muted-foreground">Answer to attack!</span>
            <span className="ml-auto text-xs text-muted-foreground">{qIdx + 1}/{questions.length}</span>
          </div>
          <p className="font-heading font-semibold text-base leading-snug">{q?.q}</p>
        </motion.div>
      </AnimatePresence>

      {/* Options */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {q?.options.map((opt, i) => {
          const isSelected = selected === opt;
          const isCorrect = opt === q.correct;
          let cls = "border-border hover:border-primary/50 hover:bg-primary/5";
          if (showResult && isCorrect) cls = "border-green-500 bg-green-500/10";
          if (showResult && isSelected && !isCorrect) cls = "border-red-500 bg-red-500/10";

          return (
            <motion.button key={i}
              whileHover={!showResult ? { scale: 1.02 } : {}} whileTap={!showResult ? { scale: 0.97 } : {}}
              onClick={() => handleAnswer(opt)} disabled={showResult}
              className={`w-full text-left p-3 rounded-xl border-2 transition-all text-sm font-medium flex items-center gap-2 ${cls}`}
            >
              <div className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold flex-shrink-0
                ${showResult && isCorrect ? "bg-green-500 text-white" : ""}
                ${showResult && isSelected && !isCorrect ? "bg-red-500 text-white" : ""}
                ${!showResult || (!isCorrect && !isSelected) ? "bg-muted text-muted-foreground" : ""}
              `}>
                {showResult && isCorrect ? <CheckCircle2 className="w-3.5 h-3.5" /> :
                 showResult && isSelected && !isCorrect ? <XCircle className="w-3.5 h-3.5" /> :
                 String.fromCharCode(65 + i)}
              </div>
              <span className="line-clamp-2">{opt}</span>
            </motion.button>
          );
        })}
      </div>

      {showResult && !gameOver && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 flex justify-end">
          <Button onClick={next} className="gap-2">
            {qIdx + 1 >= questions.length ? "End Battle" : "Next Attack"} <Sword className="w-4 h-4" />
          </Button>
        </motion.div>
      )}
    </div>
  );
}