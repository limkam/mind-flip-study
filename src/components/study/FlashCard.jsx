import React, { useState } from "react";
import { motion } from "framer-motion";
import { RotateCcw, HelpCircle, CheckCircle2 } from "lucide-react";

export default function FlashCard({ front, back, difficulty, chapter, index = 0 }) {
  const [flipped, setFlipped] = useState(false);

  const difficultyStyles = {
    easy: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
    medium: "bg-amber-500/15 text-amber-600 border-amber-500/30",
    hard: "bg-rose-500/15 text-rose-600 border-rose-500/30",
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.03 }}
      className="cursor-pointer select-none"
      style={{ perspective: "1200px" }}
      onClick={() => setFlipped(!flipped)}
    >
      <div
        className="relative w-full min-h-[300px] transition-all duration-500"
        style={{
          transformStyle: "preserve-3d",
          transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
        }}
      >
        {/* ── FRONT (Question) ── */}
        <div
          className="absolute inset-0 flex flex-col rounded-2xl overflow-hidden shadow-md border border-indigo-200 dark:border-indigo-900"
          style={{ backfaceVisibility: "hidden" }}
        >
          {/* Colored header strip */}
          <div className="bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-white/80" />
              <span className="text-xs font-semibold text-white/90 uppercase tracking-widest">Question</span>
            </div>
            <div className="flex items-center gap-2">
              {chapter && (
                <span className="text-xs text-white/70 bg-white/10 px-2 py-0.5 rounded-full truncate max-w-[140px]">
                  {chapter}
                </span>
              )}
              {difficulty && (
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${difficultyStyles[difficulty] || difficultyStyles.medium} bg-white`}>
                  {difficulty}
                </span>
              )}
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 flex items-center justify-center p-7 bg-card">
            <p className="text-lg font-medium text-center text-foreground leading-relaxed">{front}</p>
          </div>

          <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground pb-4 bg-card">
            <RotateCcw className="w-3 h-3" />
            <span>Tap to reveal answer</span>
          </div>
        </div>

        {/* ── BACK (Answer) ── */}
        <div
          className="absolute inset-0 flex flex-col rounded-2xl overflow-hidden shadow-md border border-emerald-200 dark:border-emerald-900"
          style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
        >
          {/* Colored header strip */}
          <div className="bg-gradient-to-r from-emerald-500 to-teal-500 px-5 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-white/80" />
              <span className="text-xs font-semibold text-white/90 uppercase tracking-widest">Answer</span>
            </div>
            {difficulty && (
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${difficultyStyles[difficulty] || difficultyStyles.medium} bg-white`}>
                {difficulty}
              </span>
            )}
          </div>

          {/* Body */}
          <div className="flex-1 flex items-center justify-center p-7 bg-emerald-50 dark:bg-emerald-950/20">
            <p className="text-base text-center text-foreground leading-relaxed font-medium">{back}</p>
          </div>

          <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground pb-4 bg-emerald-50 dark:bg-emerald-950/20">
            <RotateCcw className="w-3 h-3" />
            <span>Tap to flip back</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}