import React, { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { UploadCloud, CheckCircle2 } from "lucide-react";
import { demoData } from "@shared/guide/demoData";

export function UploadDemo() {
  const shouldReduceMotion = useReducedMotion();
  const [uploaded, setUploaded] = useState(true);
  const { fileName, fileSize, pages, supportedFormats } = demoData.uploadDemo;

  return (
    <div className="w-full max-w-lg mx-auto bg-slate-900/90 text-white rounded-2xl border border-slate-700/60 p-6 shadow-xl space-y-4">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-indigo-400">
          <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
          MindFlip Document Parser
        </div>
        <button
          type="button"
          onClick={() => setUploaded(!uploaded)}
          className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
        >
          {uploaded ? "Reset Demo" : "Simulate File Selection"}
        </button>
      </div>

      <button
        type="button"
        onClick={() => setUploaded(!uploaded)}
        aria-label="Upload document area. Click to toggle file selection demo."
        className={`w-full text-left border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
          uploaded
            ? "border-emerald-500/60 bg-emerald-950/20"
            : "border-indigo-500/40 hover:border-indigo-400 bg-slate-800/40"
        }`}
      >
        {!uploaded ? (
          <div className="space-y-3">
            <motion.div
              animate={shouldReduceMotion ? {} : { y: [0, -4, 0] }}
              transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut" }}
              className="w-12 h-12 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto"
            >
              <UploadCloud className="w-6 h-6" />
            </motion.div>
            <div>
              <p className="text-sm font-semibold text-slate-200">Drag & Drop PDF or Lecture Notes</p>
              <p className="text-xs text-slate-400 mt-1">{supportedFormats}</p>
            </div>
          </div>
        ) : (
          <motion.div
            initial={shouldReduceMotion ? { opacity: 1 } : { scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="flex items-center justify-between bg-slate-800/90 rounded-lg p-3 border border-emerald-500/40"
          >
            <div className="flex items-center gap-3 text-left">
              <div className="w-9 h-9 rounded-lg bg-rose-500/20 text-rose-400 flex items-center justify-center font-bold text-xs">
                PDF
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-200 truncate max-w-[200px]">
                  {fileName}
                </p>
                <p className="text-[10px] text-slate-400">{fileSize} • ~{pages} Pages parsed</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
              <CheckCircle2 className="w-4 h-4" />
              <span>Ready</span>
            </div>
          </motion.div>
        )}
      </button>
    </div>
  );
}
