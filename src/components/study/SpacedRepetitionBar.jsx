import React from "react";
import { motion } from "framer-motion";
import { ThumbsUp, Minus, ThumbsDown, Brain } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function SpacedRepetitionBar({ onRate, cardProgress }) {
  const rated = cardProgress?.rating;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-4 bg-card rounded-xl border border-border p-4"
    >
      <div className="flex items-center gap-2 mb-3">
        <Brain className="w-4 h-4 text-primary" />
        <p className="text-sm font-medium">How well did you know this?</p>
        {rated && (
          <span className={`ml-auto text-xs font-semibold px-2 py-0.5 rounded-full
            ${rated === "easy" ? "bg-emerald-500/15 text-emerald-600" :
              rated === "medium" ? "bg-amber-500/15 text-amber-600" :
              "bg-rose-500/15 text-rose-600"}`}>
            Rated: {rated}
          </span>
        )}
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => onRate("hard")}
          className={`flex-1 gap-1.5 border-rose-300 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-400 dark:hover:bg-rose-950/30
            ${rated === "hard" ? "bg-rose-50 text-rose-600 border-rose-400 dark:bg-rose-950/30" : ""}`}
        >
          <ThumbsDown className="w-3.5 h-3.5" /> Hard
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onRate("medium")}
          className={`flex-1 gap-1.5 border-amber-300 hover:bg-amber-50 hover:text-amber-600 hover:border-amber-400 dark:hover:bg-amber-950/30
            ${rated === "medium" ? "bg-amber-50 text-amber-600 border-amber-400 dark:bg-amber-950/30" : ""}`}
        >
          <Minus className="w-3.5 h-3.5" /> OK
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onRate("easy")}
          className={`flex-1 gap-1.5 border-emerald-300 hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-400 dark:hover:bg-emerald-950/30
            ${rated === "easy" ? "bg-emerald-50 text-emerald-600 border-emerald-400 dark:bg-emerald-950/30" : ""}`}
        >
          <ThumbsUp className="w-3.5 h-3.5" /> Easy
        </Button>
      </div>
    </motion.div>
  );
}