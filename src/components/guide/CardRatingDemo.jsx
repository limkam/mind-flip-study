import React, { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { RotateCw, Calendar, Sparkles } from "lucide-react";
import { demoData } from "@shared/guide/demoData";

export function CardRatingDemo() {
  const shouldReduceMotion = useReducedMotion();
  const [isFlipped, setIsFlipped] = useState(false);
  const [lastRating, setLastRating] = useState(null);

  const { question, answer, ratings } = demoData.cardRatingDemo;
  const currentSchedule = ratings.find((r) => r.score === lastRating);

  return (
    <div className="w-full max-w-lg mx-auto bg-slate-900/90 text-white rounded-2xl border border-slate-700/60 p-6 shadow-xl space-y-6">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-indigo-400">
          <Sparkles className="w-4 h-4" />
          Interactive Flashcard & Spaced Repetition Demo
        </div>
        <span className="text-[11px] text-slate-400">Click card to flip</span>
      </div>

      {/* Flashcard Area */}
      <div className="perspective-1000">
        <button
          type="button"
          onClick={() => setIsFlipped(!isFlipped)}
          aria-label={`Flashcard: ${isFlipped ? "Showing answer" : "Showing question"}. Click to flip.`}
          className="w-full text-left min-h-[140px] bg-slate-800/90 border border-slate-700 rounded-xl p-5 flex flex-col justify-between hover:border-indigo-500/50 transition-all shadow-inner relative overflow-hidden focus:outline-none focus:ring-2 focus:ring-indigo-400"
        >
          <div className="flex justify-between items-center text-[11px] font-semibold text-slate-400">
            <span>{!isFlipped ? "FRONT (Question)" : "BACK (Answer)"}</span>
            <RotateCw className="w-3.5 h-3.5 text-indigo-400" />
          </div>

          <div className="my-3 text-center">
            {!isFlipped ? (
              <p className="text-base font-bold text-slate-100">{question}</p>
            ) : (
              <p className="text-sm text-slate-200 leading-relaxed">{answer}</p>
            )}
          </div>

          <div className="text-[10px] text-center text-indigo-400/80">
            {!isFlipped ? "Click anywhere on card to reveal answer" : "Rate your recall confidence below"}
          </div>
        </button>
      </div>

      {/* Rating Buttons */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-slate-300 text-center">Rate Your Recall Confidence (1 to 5):</p>
        <div className="grid grid-cols-5 gap-2" role="group" aria-label="Recall confidence rating options">
          {ratings.map((r) => (
            <button
              key={r.score}
              type="button"
              onClick={() => {
                setLastRating(r.score);
                if (!isFlipped) setIsFlipped(true);
              }}
              aria-label={`Rate ${r.label}`}
              className={`py-2 px-1 text-xs font-bold rounded-lg border transition-all ${
                lastRating === r.score
                  ? "bg-indigo-600 text-white border-indigo-400 ring-2 ring-indigo-400"
                  : "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Qualitative Schedule Outcome Feedback */}
      {currentSchedule && (
        <motion.div
          initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-3 rounded-xl bg-indigo-950/40 border border-indigo-500/40 text-center space-y-1.5"
          aria-live="polite"
        >
          <div className="flex items-center justify-center gap-2 text-xs font-semibold text-indigo-300">
            <Calendar className="w-4 h-4" />
            <span>{currentSchedule.schedule}</span>
          </div>
          <p className="text-[11px] text-slate-400">
            Cards remembered easily return later; difficult cards return sooner based on your Ease Factor.
          </p>
        </motion.div>
      )}

      {/* Spaced Repetition Timeline */}
      <div className="pt-2 border-t border-slate-800">
        <p className="text-[11px] font-semibold text-slate-400 mb-3">Illustrative Spaced Repetition Progression:</p>
        <div className="flex items-center justify-between text-[11px] text-slate-300 px-2">
          {[
            { label: "Today", active: true },
            { label: "Sooner", active: lastRating === 1 },
            { label: "Moderate", active: lastRating === 2 || lastRating === 3 },
            { label: "Later", active: lastRating === 4 || lastRating === 5 },
          ].map((item, idx) => (
            <div key={idx} className="flex flex-col items-center gap-1.5">
              <div
                className={`w-3 h-3 rounded-full border transition-all ${
                  item.active
                    ? "bg-emerald-400 border-emerald-300 ring-4 ring-emerald-500/20"
                    : "bg-slate-800 border-slate-700"
                }`}
              />
              <span className={item.active ? "font-bold text-emerald-300" : "text-slate-500"}>
                {item.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
