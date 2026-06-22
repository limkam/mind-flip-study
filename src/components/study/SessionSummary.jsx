import React from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Clock, Target, TrendingUp, RotateCcw, BookOpen, Zap, Home } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function SessionSummary({
  stats,
  onReviewHard,
  onContinue,
  onGenerateQuiz,
  mode = "study",
}) {
  const navigate = useNavigate();
  const {
    total = 0,
    hard = 0,
    medium = 0,
    easy = 0,
    durationMs = 0,
    completionRate = 100,
    confidenceScore = 0,
  } = stats;

  const accuracy = total > 0 ? Math.round(((easy + medium) / total) * 100) : 0;
  const mins = Math.max(1, Math.round(durationMs / 60000));

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-lg mx-auto text-center py-10"
    >
      <div className={`w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center
        ${mode === "games" ? "bg-amber-500/15 text-amber-600" : "bg-emerald-500/15 text-emerald-600"}`}>
        {mode === "games" ? <Zap className="w-8 h-8" /> : <Target className="w-8 h-8" />}
      </div>

      <h2 className="font-heading text-2xl font-bold mb-1">
        {mode === "games" ? "Game Session Complete!" : "Study Session Complete!"}
      </h2>
      <p className="text-muted-foreground text-sm mb-8">
        {mode === "games" ? "Great work — keep the streak going!" : "Nice progress — your ratings power spaced repetition."}
      </p>

      <div className="grid grid-cols-2 gap-3 mb-6 text-left">
        <Stat label="Cards Reviewed" value={total} />
        <Stat label="Time Spent" value={`${mins} min`} icon={Clock} />
        <Stat label="Hard" value={hard} className="text-rose-600" />
        <Stat label="OK" value={medium} className="text-amber-600" />
        <Stat label="Easy" value={easy} className="text-emerald-600" />
        <Stat label="Accuracy" value={`${accuracy}%`} icon={TrendingUp} />
        {mode === "study" && (
          <>
            <Stat label="Confidence" value={`${confidenceScore}%`} />
            <Stat label="Completion" value={`${completionRate}%`} />
          </>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {hard > 0 && onReviewHard && (
          <Button onClick={onReviewHard} className="gap-2">
            <RotateCcw className="w-4 h-4" /> Practice Hard Cards Again
          </Button>
        )}
        {onContinue && (
          <Button variant="outline" onClick={onContinue} className="gap-2">
            <BookOpen className="w-4 h-4" /> Continue Studying
          </Button>
        )}
        {onGenerateQuiz && (
          <Button variant="outline" onClick={onGenerateQuiz} className="gap-2">
            <Zap className="w-4 h-4" /> Generate Quiz
          </Button>
        )}
        <Button variant="ghost" onClick={() => navigate("/")} className="gap-2 text-muted-foreground">
          <Home className="w-4 h-4" /> Return to Dashboard
        </Button>
      </div>
    </motion.div>
  );
}

function Stat({ label, value, icon: Icon, className = "" }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={`text-xl font-bold flex items-center gap-1.5 ${className}`}>
        {Icon && <Icon className="w-4 h-4" />}
        {value}
      </p>
    </div>
  );
}
