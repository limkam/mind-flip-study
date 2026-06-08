import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BookOpen, ChevronDown, ChevronUp, Lightbulb, AlertTriangle, Star, FileText } from "lucide-react";

const DIFFICULTY_STYLES = {
  beginner: { label: "Beginner", className: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" },
  intermediate: { label: "Intermediate", className: "bg-amber-500/15 text-amber-600 border-amber-500/30" },
  advanced: { label: "Advanced", className: "bg-rose-500/15 text-rose-600 border-rose-500/30" },
};

// A mini flashcard-style tile
function MiniCard({ headerBg, headerContent, children }) {
  return (
    <div className="rounded-xl overflow-hidden border border-border shadow-sm">
      <div className={`px-4 py-2.5 flex items-center gap-2 ${headerBg}`}>
        {headerContent}
      </div>
      <div className="p-4 bg-card text-sm text-foreground leading-relaxed">
        {children}
      </div>
    </div>
  );
}

export default function SummaryCard({
  chapter, overview, coreConcept, keyPoints = [],
  commonMistakes = [], difficulty, index = 0, defaultOpen = false
}) {
  const [expanded, setExpanded] = useState(defaultOpen);
  const diff = DIFFICULTY_STYLES[difficulty] || null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="rounded-2xl border border-border overflow-hidden shadow-sm bg-card"
    >
      {/* Chapter Header — acts like a flashcard header strip */}
      <div
        className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-muted/40 transition-colors bg-gradient-to-r from-indigo-600 to-violet-600"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center flex-shrink-0">
          <BookOpen className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-heading font-semibold text-white">{chapter}</h3>
            {diff && (
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border bg-white ${diff.className}`}>
                {diff.label}
              </span>
            )}
          </div>
          <p className="text-xs text-white/70 mt-0.5">
            {keyPoints.length} key points{commonMistakes.length > 0 ? ` · ${commonMistakes.length} pitfalls` : ""}
          </p>
        </div>
        <span className="text-white/80 flex-shrink-0">
          {expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </span>
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="content"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="p-4 space-y-3 bg-muted/30">

              {/* Core Concept — indigo flashcard (like question side) */}
              {coreConcept && (
                <MiniCard
                  headerBg="bg-gradient-to-r from-indigo-600 to-violet-600"
                  headerContent={
                    <>
                      <Star className="w-3.5 h-3.5 text-white/80" />
                      <span className="text-xs font-semibold text-white/90 uppercase tracking-widest">Core Concept</span>
                    </>
                  }
                >
                  <p className="font-medium">{coreConcept}</p>
                </MiniCard>
              )}

              {/* Overview — slate/neutral flashcard */}
              {overview && (
                <MiniCard
                  headerBg="bg-gradient-to-r from-slate-600 to-slate-700"
                  headerContent={
                    <>
                      <FileText className="w-3.5 h-3.5 text-white/80" />
                      <span className="text-xs font-semibold text-white/90 uppercase tracking-widest">Overview</span>
                    </>
                  }
                >
                  {overview}
                </MiniCard>
              )}

              {/* Key Points — emerald flashcard (like answer side) */}
              {keyPoints.length > 0 && (
                <MiniCard
                  headerBg="bg-gradient-to-r from-emerald-500 to-teal-500"
                  headerContent={
                    <>
                      <Lightbulb className="w-3.5 h-3.5 text-white/80" />
                      <span className="text-xs font-semibold text-white/90 uppercase tracking-widest">Key Points</span>
                    </>
                  }
                >
                  <ul className="space-y-2">
                    {keyPoints.map((point, i) => (
                      <li key={i} className="flex items-start gap-2.5">
                        <span className="w-5 h-5 rounded-full bg-emerald-500/15 text-emerald-600 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                          {i + 1}
                        </span>
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </MiniCard>
              )}

              {/* Common Mistakes — amber warning flashcard */}
              {commonMistakes.length > 0 && (
                <MiniCard
                  headerBg="bg-gradient-to-r from-amber-500 to-orange-500"
                  headerContent={
                    <>
                      <AlertTriangle className="w-3.5 h-3.5 text-white/80" />
                      <span className="text-xs font-semibold text-white/90 uppercase tracking-widest">Watch Out For</span>
                    </>
                  }
                >
                  <ul className="space-y-2">
                    {commonMistakes.map((mistake, i) => (
                      <li key={i} className="flex items-start gap-2.5">
                        <span className="text-amber-500 font-bold flex-shrink-0 mt-0.5">!</span>
                        <span>{mistake}</span>
                      </li>
                    ))}
                  </ul>
                </MiniCard>
              )}

            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}