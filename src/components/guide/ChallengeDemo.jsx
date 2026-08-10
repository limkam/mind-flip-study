import React, { useState } from "react";
import { Swords, CheckCircle, Send, Trophy } from "lucide-react";
import { demoData } from "@shared/guide/demoData";

export function ChallengeDemo({ stepId }) {
  const [sent, setSent] = useState(false);
  const { opponentEmail, targetTopic, userScore, userTime, opponentScore, opponentTime } = demoData.challengeDemo;

  if (stepId === "compete_result") {
    return (
      <div className="w-full max-w-lg mx-auto bg-slate-900/90 text-white rounded-2xl border border-slate-700/60 p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-purple-400">
            <Trophy className="w-4 h-4" />
            1v1 Challenge Scorecard Result
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">
            MATCH COMPLETED
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-1">
          <div className="p-4 rounded-xl bg-purple-950/40 border border-purple-500/50 text-center space-y-1">
            <p className="text-[10px] uppercase tracking-wider text-purple-300 font-bold">YOU</p>
            <p className="text-2xl font-black text-white">{userScore}</p>
            <p className="text-[10px] text-slate-400">Time: {userTime}</p>
          </div>
          <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700 text-center space-y-1">
            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">CHALLENGER</p>
            <p className="text-2xl font-black text-slate-300">{opponentScore}</p>
            <p className="text-[10px] text-slate-400">Time: {opponentTime}</p>
          </div>
        </div>

        <div className="text-center p-2 rounded-lg bg-emerald-950/30 border border-emerald-500/30 text-xs text-emerald-300 font-medium">
          🏆 Victory! You earned +20 XP and a match win badge.
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-lg mx-auto bg-slate-900/90 text-white rounded-2xl border border-slate-700/60 p-6 shadow-xl space-y-4">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-purple-400">
          <Swords className="w-4 h-4" />
          Send 1v1 Quiz Challenge
        </div>
        <span className="text-[11px] text-slate-400">Target: {targetTopic}</span>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-[11px] font-semibold text-slate-300 block mb-1">Opponent Email or Peer:</label>
          <div className="flex gap-2">
            <input
              type="text"
              readOnly
              value={opponentEmail}
              className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 outline-none"
            />
            <button
              type="button"
              onClick={() => setSent(!sent)}
              className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-purple-400"
            >
              {sent ? <CheckCircle className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />}
              <span>{sent ? "Sent!" : "Send"}</span>
            </button>
          </div>
        </div>

        {sent && (
          <div className="p-3 rounded-xl bg-purple-950/30 border border-purple-500/40 text-xs text-purple-200 text-center">
            Challenge invite sent to Haja! They will receive a notification to join the match.
          </div>
        )}
      </div>
    </div>
  );
}
