import React, { useState } from "react";
import { Check } from "lucide-react";
import { demoData } from "@shared/guide/demoData";

export function ChapterSelectionDemo() {
  const chaptersList = demoData.chapterDemo.chapters;
  const [selected, setSelected] = useState(() =>
    chaptersList.reduce((acc, ch) => ({ ...acc, [ch.key]: ch.defaultSelected }), {})
  );

  const toggle = (key) => {
    setSelected((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="w-full max-w-lg mx-auto bg-slate-900/90 text-white rounded-2xl border border-slate-700/60 p-6 shadow-xl space-y-4">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <p className="text-xs font-semibold text-slate-300">Select Target Chapters for AI Parsing</p>
        <span className="text-[11px] px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-medium">
          {Object.values(selected).filter(Boolean).length} Selected
        </span>
      </div>

      <div className="space-y-2" role="group" aria-label="Chapter selection options">
        {chaptersList.map((ch) => {
          const isChecked = selected[ch.key];
          return (
            <button
              key={ch.key}
              type="button"
              onClick={() => toggle(ch.key)}
              aria-pressed={isChecked}
              className={`w-full text-left flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
                isChecked
                  ? "bg-indigo-950/40 border-indigo-500/60 text-white"
                  : "bg-slate-800/30 border-slate-800 text-slate-400 hover:border-slate-700"
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-5 h-5 rounded flex items-center justify-center transition-all ${
                    isChecked ? "bg-indigo-600 text-white" : "border border-slate-600 bg-slate-800"
                  }`}
                >
                  {isChecked && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                </div>
                <span className="text-xs font-medium">{ch.title}</span>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">{ch.cards}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
