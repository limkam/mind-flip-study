import React, { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Trophy, ArrowUp, ArrowDown, Sparkles } from "lucide-react";
import { demoData } from "@shared/guide/demoData";

export function LeaderboardOvertakeDemo() {
  const shouldReduceMotion = useReducedMotion();
  const [overtaken, setOvertaken] = useState(false);
  const [period, setPeriod] = useState("weekly");
  const [scope, setScope] = useState("global");

  const { initialRows, overtakenRows, xpNeededToOvertake } = demoData.leaderboardDemo;
  const rows = overtaken ? overtakenRows : initialRows;

  const currentSummary = overtaken
    ? "After interaction: You gained 31 XP and strictly overtaken Mohamed Hassan to rank 25."
    : "Before interaction: You are rank 26 with 520 XP. Mohamed Hassan is rank 25 with 550 XP.";

  return (
    <div className="w-full max-w-lg mx-auto bg-slate-900/90 text-white rounded-2xl border border-slate-700/60 p-6 shadow-xl space-y-5">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-amber-400">
          <Trophy className="w-4 h-4 text-amber-400" />
          Strict Overtake & Rank Movement Demo
        </div>
        <button
          type="button"
          onClick={() => setOvertaken(!overtaken)}
          className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 transition focus:outline-none focus:ring-2 focus:ring-amber-400"
        >
          {overtaken ? "Reset Demo" : `Simulate +${xpNeededToOvertake} XP Overtake`}
        </button>
      </div>

      {/* Scope & Period Selectors */}
      <div className="flex items-center justify-between text-xs gap-2">
        <div className="flex rounded-lg bg-slate-800 p-1 border border-slate-700">
          <button
            type="button"
            onClick={() => setPeriod("weekly")}
            className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition ${
              period === "weekly" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Weekly (Mon 00:00 UTC)
          </button>
          <button
            type="button"
            onClick={() => setPeriod("alltime")}
            className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition ${
              period === "alltime" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            All Time
          </button>
        </div>

        <div className="flex rounded-lg bg-slate-800 p-1 border border-slate-700">
          <button
            type="button"
            onClick={() => setScope("global")}
            className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition ${
              scope === "global" ? "bg-amber-600 text-white" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Global Top 25
          </button>
          <button
            type="button"
            onClick={() => setScope("friends")}
            className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition ${
              scope === "friends" ? "bg-amber-600 text-white" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Friends & Groups
          </button>
        </div>
      </div>

      {/* Screen Reader Summary */}
      <div className="sr-only" aria-live="polite">
        {currentSummary}
      </div>

      {/* Animated Rank Rows */}
      <div className="space-y-2" role="region" aria-label="Leaderboard rank preview">
        {rows.map((row) => (
          <motion.div
            key={row.name}
            layout={!shouldReduceMotion}
            transition={{ type: "spring", stiffness: 350, damping: 25 }}
            className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
              row.isUser
                ? "bg-amber-950/40 border-amber-500/60 ring-1 ring-amber-500/30 text-white"
                : "bg-slate-800/40 border-slate-800 text-slate-300"
            }`}
          >
            <div className="flex items-center gap-3">
              <span
                className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs ${
                  row.isUser ? "bg-amber-500 text-slate-950" : "bg-slate-700 text-slate-300"
                }`}
              >
                #{row.rank}
              </span>
              <span className="text-xs font-semibold">{row.name}</span>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs font-mono font-bold text-amber-400">{row.xp} XP</span>
              {row.moved === "up" && (
                <span className="flex items-center text-[10px] font-bold text-emerald-400 bg-emerald-950/50 px-1.5 py-0.5 rounded border border-emerald-500/40">
                  <ArrowUp className="w-3 h-3 mr-0.5" /> +1 Rank
                </span>
              )}
              {row.moved === "down" && (
                <span className="flex items-center text-[10px] font-bold text-rose-400 bg-rose-950/50 px-1.5 py-0.5 rounded border border-rose-500/40">
                  <ArrowDown className="w-3 h-3 mr-0.5" /> -1
                </span>
              )}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Explanatory Banner */}
      <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700 text-xs text-slate-300 leading-relaxed">
        <p className="font-semibold text-amber-400 mb-1 flex items-center gap-1">
          <Sparkles className="w-3.5 h-3.5" />
          Strict Overtake Rule:
        </p>
        To overtake competitor #25 (550 XP), you need at least <strong className="text-white">551 XP (+31 XP)</strong>. Matching 550 XP does not trigger an overtake due to tie-breaker rules.
      </div>
    </div>
  );
}
