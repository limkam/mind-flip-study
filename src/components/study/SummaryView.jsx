import React, { useState } from "react";
import client from "@/api/client";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Sparkles, BookOpen, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import SummaryCard from "./SummaryCard";

export default function SummaryView({ cards, bookTitle, selectedChapters }) {
  const [summaries, setSummaries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);

  const generateSummaries = async () => {
    setLoading(true);
    setGenerated(false);

    // Group cards by chapter
    const byChapter = {};
    cards.forEach(card => {
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
      prompt: `You are an expert educational content creator. Based on the flashcard Q&A pairs below from the book "${bookTitle}", generate rich, high-quality chapter summaries.

${chapterList.map(c => `=== CHAPTER: ${c.chapter} (${c.cardCount} cards) ===\n${c.qa}`).join("\n\n---\n\n")}

For EACH chapter, produce:
1. **overview**: A clear 3-5 sentence overview that explains what the chapter covers, why it matters, and how concepts connect. Write it as if explaining to a motivated student.
2. **key_points**: 5-8 concise, memorable bullet points. Each should be a complete, standalone insight — not just a word or phrase.
3. **core_concept**: A single sentence that captures the most essential idea of the chapter in plain language (the "if you remember one thing" takeaway).
4. **common_mistakes**: 2-3 short notes on common misconceptions or tricky areas students should watch out for.
5. **difficulty**: Rate the chapter as "beginner", "intermediate", or "advanced" based on the complexity of the material.

Return structured JSON covering every chapter listed.`,
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
      {!generated && !loading && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center py-16 bg-card rounded-2xl border border-border"
        >
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <BookOpen className="w-8 h-8 text-primary" />
          </div>
          <h3 className="font-heading text-xl font-semibold mb-2">Chapter Summaries</h3>
          <p className="text-muted-foreground text-sm max-w-sm mx-auto mb-6">
            Generate rich AI-powered summaries, key insights, core concepts, and common pitfalls for each chapter.
          </p>
          <Button onClick={generateSummaries} className="gap-2 px-8">
            <Sparkles className="w-4 h-4" /> Generate Summaries
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