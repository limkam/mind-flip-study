import React from "react";
import { motion } from "framer-motion";

const GAMES = [
  {
    id: "mcq",
    emoji: "❓",
    title: "Classic Quiz",
    description: "Multiple choice questions with streak bonuses. Race against your best score!",
    color: "from-violet-500/20 to-violet-500/5 border-violet-500/30",
    badge: "Classic",
  },
  {
    id: "lightning",
    emoji: "⚡",
    title: "Lightning Round",
    description: "60 seconds, 2 choices per question. Answer as many as you can — pure speed!",
    color: "from-yellow-500/20 to-yellow-500/5 border-yellow-500/30",
    badge: "Speed",
  },
  {
    id: "battle",
    emoji: "⚔️",
    title: "Battle RPG",
    description: "Fight enemies with your knowledge! Answer correctly to attack, wrong = take damage.",
    color: "from-red-500/20 to-red-500/5 border-red-500/30",
    badge: "RPG",
  },
  {
    id: "memory",
    emoji: "🃏",
    title: "Memory Match",
    description: "Flip tiles to match questions with their answers. Train your memory!",
    color: "from-green-500/20 to-green-500/5 border-green-500/30",
    badge: "Memory",
  },
  {
    id: "hangman",
    emoji: "🎯",
    title: "Hangman",
    description: "Guess the answer letter by letter before the figure is complete. You vs Computer!",
    color: "from-orange-500/20 to-orange-500/5 border-orange-500/30",
    badge: "Survival",
  },
  {
    id: "tugofwar",
    emoji: "🪢",
    title: "Tug of War",
    description: "Answer correctly to pull the rope to your side. Race against the clock vs Computer!",
    color: "from-blue-500/20 to-blue-500/5 border-blue-500/30",
    badge: "Action",
  },
  {
    id: "bricks",
    emoji: "🧱",
    title: "Brick Breaker",
    description: "Answer correctly to launch the ball and smash bricks. Clear the board to win!",
    color: "from-cyan-500/20 to-cyan-500/5 border-cyan-500/30",
    badge: "Arcade",
  },
  {
    id: "scramble",
    emoji: "🔤",
    title: "Word Scramble",
    description: "Unscramble the answer before the computer solves it. Race against the clock!",
    color: "from-pink-500/20 to-pink-500/5 border-pink-500/30",
    badge: "Words",
  },
];

export default function GameSelector({ onSelect }) {
  return (
    <div className="max-w-3xl mx-auto">
      <div className="text-center mb-8">
        <motion.h2 initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          className="font-heading text-2xl font-bold mb-2">Choose Your Game Mode</motion.h2>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
          className="text-muted-foreground">Pick a challenge and test your knowledge!</motion.p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {GAMES.map((game, i) => (
          <motion.button
            key={game.id}
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: i * 0.08, type: "spring", stiffness: 260, damping: 22 }}
            whileHover={{ scale: 1.04, y: -4, boxShadow: "0 20px 40px -12px rgba(0,0,0,0.25)" }}
            whileTap={{ scale: 0.97 }}
            onClick={() => onSelect(game.id)}
            className={`w-full text-left bg-gradient-to-br ${game.color} border rounded-2xl p-6 transition-colors duration-200`}
          >
            <motion.div
              animate={{ rotate: [0, -5, 5, -3, 3, 0] }}
              transition={{ duration: 1.5, delay: i * 0.2 + 0.5, repeat: Infinity, repeatDelay: 4 }}
              className="text-4xl mb-3 inline-block"
            >{game.emoji}</motion.div>
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-heading font-bold text-lg">{game.title}</h3>
              <span className="text-xs font-semibold bg-white/30 dark:bg-black/20 px-2 py-0.5 rounded-full">
                {game.badge}
              </span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">{game.description}</p>
          </motion.button>
        ))}
      </div>
    </div>
  );
}