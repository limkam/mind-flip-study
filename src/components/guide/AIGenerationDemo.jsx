import React, { useState, useEffect } from "react";
import { CheckCircle2, Sparkles, RefreshCw } from "lucide-react";

export function AIGenerationDemo() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setProgress((prev) => (prev >= 100 ? 100 : prev + 25));
    }, 600);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="w-full max-w-lg mx-auto bg-slate-900/90 text-white rounded-2xl border border-slate-700/60 p-6 shadow-xl space-y-4">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-amber-400">
          <Sparkles className="w-4 h-4 animate-spin-slow" />
          MindFlip AI Study Suite Engine
        </div>
        <button
          onClick={() => setProgress(0)}
          className="text-[11px] p-1 rounded hover:bg-slate-800 text-slate-400"
          title="Replay generation"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="space-y-3">
        <div>
          <div className="flex justify-between text-xs text-slate-300 font-medium mb-1.5">
            <span>Generating Study Materials...</span>
            <span className="font-mono text-indigo-400 font-bold">{progress}%</span>
          </div>
          <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
            <div
              className="bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-400 h-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2.5 pt-2">
          {[
            { label: "Flashcards", target: 30 },
            { label: "Quiz Questions", target: 60 },
            { label: "Summary & Notes", target: 90 },
          ].map((item, idx) => {
            const isDone = progress >= item.target;
            return (
              <div
                key={idx}
                className={`p-3 rounded-xl border text-center transition-all ${
                  isDone
                    ? "bg-emerald-950/30 border-emerald-500/50 text-emerald-300"
                    : "bg-slate-800/30 border-slate-800 text-slate-500"
                }`}
              >
                <div className="flex items-center justify-center gap-1.5 text-xs font-semibold">
                  {isDone ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <div className="w-2 h-2 rounded-full bg-slate-600 animate-ping" />}
                  <span>{item.label}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
