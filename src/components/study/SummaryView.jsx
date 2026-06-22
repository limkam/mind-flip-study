import React, { useState } from "react";
import client from "@/api/client";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import SummaryCard from "./SummaryCard";
import { formatSummaryScope, buildEnhancedSummaryPrompt } from "@/lib/summaryScope";

export default function SummaryView({ cards, bookTitle, selectedChapters, prefillSummary, chapterSummaries = [] }) {
  const [summaries, setSummaries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);
  const hasPrefill = Boolean(prefillSummary?.trim());
  const scopeLabel = formatSummaryScope(selectedChapters, bookTitle);

  const scopedCards = (selectedChapters?.length > 0)
    ? cards.filter((c) => selectedChapters.includes(c.chapter))
    : cards;

  const scopedChapterSummaries = (selectedChapters?.length > 0)
    ? chapterSummaries.filter((ch) => selectedChapters.includes(ch.chapter))
    : chapterSummaries;

  const generateSummaries = async () => {
    setLoading(true);
    setGenerated(false);

    const byChapter = {};
    scopedCards.forEach(card => {
      const ch = card.chapter || "General";
      if (!byChapter[ch]) byChapter[ch] = [];
      byChapter[ch].push(card);
    });

    const chapterList = Object.entries(byChapter).map(([chapter, chCards]) => ({
      chapter,
      cardCount: chCards.length,
      qa: chCards.map(c => `Q: ${c.front}\nA: ${c.back}`).join("\n\n"),
      difficulties: chCards.map(c => c.difficulty).filter(Boolean),
    }));

    const { data: result } = await client.post("/ai/invoke", {
      prompt: buildEnhancedSummaryPrompt({ bookTitle, chapterList, detailLevel: "standard" }),
      response_json_schema: {
        type: "object",
        properties: {
          chapters: {
            type: "array",
            items: {
              type: "object",
              properties: {
                chapter: { type: "string" },
                overview: { type: "string" },
                core_concept: { type: "string" },
                key_points: { type: "array", items: { type: "string" } },
                common_mistakes: { type: "array", items: { type: "string" } },
                difficulty: { type: "string" }
              }
            }
          }
        }
      },
    });

    setSummaries(result.chapters || []);
    setGenerated(true);
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase mb-0.5">Summary Scope</p>
        <p className="text-sm font-medium">{scopeLabel}</p>
      </div>

      {scopedChapterSummaries.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-heading text-lg font-semibold">Chapter Breakdown</h3>
          {scopedChapterSummaries.map((ch, i) => (
            <SummaryCard
              key={ch.chapter || i}
              index={i}
              chapter={ch.chapter}
              overview={ch.overview || ch.summary}
              coreConcept={ch.core_concept}
              keyPoints={ch.key_points || []}
              commonMistakes={ch.watch_out_for || ch.common_mistakes || []}
              difficulty={ch.difficulty}
              defaultOpen={i === 0}
            />
          ))}
        </div>
      )}

      {hasPrefill && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-border bg-card p-6"
        >
          <h3 className="font-heading text-lg font-semibold mb-3">Study Summary</h3>
          <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{prefillSummary}</p>
        </motion.div>
      )}

      {!generated && !loading && scopedChapterSummaries.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center py-10 bg-card rounded-2xl border border-border"
        >
          <h3 className="font-heading text-lg font-semibold mb-2">Enhanced Summaries</h3>
          <p className="text-muted-foreground text-sm max-w-sm mx-auto mb-6">
            {hasPrefill
              ? "Optional: generate richer per-chapter summaries from your flashcards."
              : "Summaries are created when you generate flashcards. You can also create enhanced summaries from your cards."}
          </p>
          <Button onClick={generateSummaries} className="gap-2 px-8">
            <Sparkles className="w-4 h-4" /> Generate Enhanced Summaries
          </Button>
        </motion.div>
      )}

      {loading && (
        <div className="text-center py-16 bg-card rounded-2xl border border-border">
          <div className="relative w-14 h-14 mx-auto mb-4">
            <div className="absolute inset-0 rounded-full border-4 border-primary/20" />
            <div className="absolute inset-0 rounded-full border-4 border-t-primary animate-spin" />
            <Sparkles className="absolute inset-0 m-auto w-5 h-5 text-primary" />
          </div>
          <p className="font-medium text-foreground">Crafting chapter summaries...</p>
          <p className="text-sm text-muted-foreground mt-1">AI is analyzing your flashcards in depth</p>
        </div>
      )}

      <AnimatePresence>
        {generated && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-4"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground font-medium">
                {summaries.length} chapter{summaries.length !== 1 ? "s" : ""} summarized
              </p>
              <Button variant="ghost" size="sm" onClick={generateSummaries} className="gap-1.5 text-muted-foreground">
                <RefreshCw className="w-3.5 h-3.5" /> Regenerate
              </Button>
            </div>
            {summaries.map((s, i) => (
              <SummaryCard
                key={i}
                index={i}
                chapter={s.chapter}
                overview={s.overview}
                coreConcept={s.core_concept}
                keyPoints={s.key_points || []}
                commonMistakes={s.common_mistakes || []}
                difficulty={s.difficulty}
                defaultOpen={i === 0}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
