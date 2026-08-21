import React, { useState } from "react";
import { Info, Brain } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const RATING_INFO = [
  { key: "hard", label: "Hard", color: "text-rose-600", desc: "Reviewed again soon. Use when you struggled to recall." },
  { key: "medium", label: "OK", color: "text-amber-600", desc: "Reviewed at a normal interval. You knew it with effort." },
  { key: "easy", label: "Easy", color: "text-emerald-600", desc: "Reviewed after a longer interval. You recalled it confidently." },
];

const ONBOARDING_KEY = "bilkeys_rating_onboarding_seen";

export function RatingExplanation({ compact = false }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <Info className="w-3.5 h-3.5" />
            {!compact && "What do ratings do?"}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs p-3">
          <div className="flex items-center gap-1.5 mb-2 font-medium text-sm">
            <Brain className="w-3.5 h-3.5" /> Spaced Repetition
          </div>
          <p className="text-xs text-muted-foreground mb-2">
            Your ratings schedule when each card appears again. Hard cards come back sooner; Easy cards wait longer.
          </p>
          {RATING_INFO.map((r) => (
            <p key={r.key} className="text-xs mb-1">
              <span className={`font-semibold ${r.color}`}>{r.label}:</span> {r.desc}
            </p>
          ))}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function RatingOnboarding({ onDismiss }) {
  const [visible, setVisible] = useState(() => !localStorage.getItem(ONBOARDING_KEY));

  if (!visible) return null;

  const dismiss = () => {
    localStorage.setItem(ONBOARDING_KEY, "1");
    setVisible(false);
    onDismiss?.();
  };

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 mb-4">
      <div className="flex items-center gap-2 mb-2">
        <Brain className="w-4 h-4 text-primary" />
        <p className="text-sm font-semibold">How ratings work</p>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Rate each card to power the spaced repetition system. Your choice determines when you see the card again.
      </p>
      <div className="space-y-1.5 mb-3">
        {RATING_INFO.map((r) => (
          <p key={r.key} className="text-xs">
            <span className={`font-semibold ${r.color}`}>{r.label}:</span> {r.desc}
          </p>
        ))}
      </div>
      <button type="button" onClick={dismiss} className="text-xs text-primary font-medium hover:underline">
        Got it
      </button>
    </div>
  );
}
