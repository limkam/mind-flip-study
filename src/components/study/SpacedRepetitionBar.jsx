import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ThumbsUp, Minus, ThumbsDown, Brain, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RatingExplanation } from "./RatingHelp";

export default function SpacedRepetitionBar({
  onRate,
  cardProgress,
  required = false,
  onSkip,
  disabled = false,
}) {
  const persisted = cardProgress?.rating;
  const [pending, setPending] = useState(null);
  const rated = pending ?? persisted;

  useEffect(() => {
    setPending(null);
  }, [cardProgress?.card_id]);

  const handleRate = (rating) => {
    if (disabled || pending) return;
    setPending(rating);
    void Promise.resolve(onRate(rating)).catch(() => {
      setPending(null);
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-4 bg-card rounded-xl border border-border p-4"
    >
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <Brain className="w-4 h-4 text-primary" />
        <p className="text-sm font-medium">
          How well did you know this?
          {!required && (
            <span className="text-muted-foreground font-normal ml-1">(optional)</span>
          )}
        </p>
        <RatingExplanation compact />
        {rated && !pending && (
          <span className={`ml-auto text-xs font-semibold px-2 py-0.5 rounded-full transition-all duration-75 flex items-center gap-1
            ${rated === "easy" ? "bg-emerald-500/15 text-emerald-600" :
              rated === "medium" ? "bg-amber-500/15 text-amber-600" :
              "bg-rose-500/15 text-rose-600"}`}>
            <Check className="w-3 h-3" /> {rated}
          </span>
        )}
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => handleRate("hard")}
          disabled={disabled || !!pending}
          className={`flex-1 gap-1.5 border-rose-300 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-400 dark:hover:bg-rose-950/30 transition-all duration-75
            ${rated === "hard" ? "bg-rose-50 text-rose-600 border-rose-400 dark:bg-rose-950/30 scale-[1.04] shadow-sm" : ""}`}
        >
          <ThumbsDown className="w-3.5 h-3.5" /> Hard
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => handleRate("medium")}
          disabled={disabled || !!pending}
          className={`flex-1 gap-1.5 border-amber-300 hover:bg-amber-50 hover:text-amber-600 hover:border-amber-400 dark:hover:bg-amber-950/30 transition-all duration-75
            ${rated === "medium" ? "bg-amber-50 text-amber-600 border-amber-400 dark:bg-amber-950/30 scale-[1.04] shadow-sm" : ""}`}
        >
          <Minus className="w-3.5 h-3.5" /> OK
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => handleRate("easy")}
          disabled={disabled || !!pending}
          className={`flex-1 gap-1.5 border-emerald-300 hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-400 dark:hover:bg-emerald-950/30 transition-all duration-75
            ${rated === "easy" ? "bg-emerald-50 text-emerald-600 border-emerald-400 dark:bg-emerald-950/30 scale-[1.04] shadow-sm" : ""}`}
        >
          <ThumbsUp className="w-3.5 h-3.5" /> Easy
        </Button>
      </div>
      {!required && onSkip ? (
        <div className="mt-3 flex justify-center">
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={onSkip}>
            Skip for now
          </Button>
        </div>
      ) : null}
      {required && !rated ? (
        <p className="text-xs text-muted-foreground text-center mt-2">
          Rate this card to continue
        </p>
      ) : null}
    </motion.div>
  );
}
